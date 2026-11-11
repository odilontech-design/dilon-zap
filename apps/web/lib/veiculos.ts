import { prisma, type PaymentMethod, type Prisma } from "@dilon-zap/db";
import { diaAoMeioDia, gerarParcelas } from "@dilon-zap/receivables";
import type { z } from "zod";
import { categoriaDeVendas, garantirPlano } from "@/lib/categorias-financeiras";
import { ErroDeConta, cancelarParcela, receberNaConta, sincronizarConta, type Db } from "@/lib/contas-receber";
import { criarContaPagar, pagarNaConta } from "@/lib/contas-pagar";
import { upsertContactByPhone } from "@/lib/contact-server";
import { numeroGeral } from "@/lib/whatsapp-sessions";
import { wakeOutbox } from "@/lib/worker-client";
import { encerrarConta, SELECT_PARCELAS, resumoDasParcelas } from "@/lib/otica-financeiro";
import { telefoneParaWhatsApp } from "@/lib/otica-schemas";
import {
  ROTULO_CUSTO,
  STATUS_NO_PATIO,
  fichaParaCliente,
  nomeDoVeiculo,
  normalizarPlaca,
  placaParaTela,
  placaValida,
  restanteDaVenda,
  type TipoCusto,
} from "@/lib/veiculos-regras";
import type {
  DadosVeiculo,
  clienteSchema,
  custoSchema,
  entradaVeiculoSchema,
  reservaSchema,
  vendaSchema,
} from "@/lib/veiculos-schemas";

/**
 * O lado com banco da revenda de veículos.
 *
 * Mesmo desenho da ótica: o dinheiro não tem caderno próprio. A compra e os
 * gastos de oficina viram CONTAS A PAGAR, o sinal e a venda viram uma CONTA A
 * RECEBER, o repasse do consignado vira conta a pagar ao dono. Assim o Caixa,
 * o DRE e os lembretes de vencimento que já existem enxergam a revenda sem
 * nenhuma tela nova.
 *
 * Tudo que mexe em carro e dinheiro junto roda numa transação só.
 */

/** Erro com a mensagem que a tela mostra (e o status HTTP). */
export class ErroDeVeiculo extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/* ------------------------------------------------------------------ apoio */

/**
 * O cliente da tela: o contato escolhido, ou um novo pelo telefone. Fica FORA
 * da transação: achar o número no WhatsApp é uma chamada ao worker, e
 * transação aberta esperando rede segura conexão do banco.
 */
export async function resolverCliente(tenantId: string, c: z.infer<typeof clienteSchema>): Promise<string> {
  if ("contactId" in c) {
    const existe = await prisma.contact.findFirst({ where: { id: c.contactId, tenantId }, select: { id: true } });
    if (!existe) throw new ErroDeVeiculo("cliente não encontrado", 404);
    return existe.id;
  }
  const digitos = telefoneParaWhatsApp(c.novoCliente.telefone);
  if (digitos.length < 12) throw new ErroDeVeiculo("telefone inválido: use DDD + número");
  const { contact } = await upsertContactByPhone(tenantId, digitos, c.novoCliente.nome);
  return contact.id;
}

/** O vendedor tem que ser da própria empresa; senão fica sem. */
export async function vendedorValido(tenantId: string, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const u = await prisma.user.findFirst({ where: { id, tenantId }, select: { id: true } });
  return u?.id ?? null;
}

/** Os dados do formulário como vão para o banco: placa normalizada, textos vazios viram nulo. */
export function dadosParaBanco(d: Partial<DadosVeiculo>): Prisma.VeiculoUncheckedUpdateInput {
  const out: Prisma.VeiculoUncheckedUpdateInput = {};
  if (d.placa !== undefined) {
    const placa = normalizarPlaca(d.placa);
    if (placa && !placaValida(placa)) throw new ErroDeVeiculo("placa inválida: use o formato ABC1234 ou ABC1D23");
    out.placa = placa;
  }
  const textos = ["chassi", "renavam", "versao", "cor", "combustivel", "cambio", "codigoFipe", "fipeReferencia", "descricao", "observacoesInternas"] as const;
  for (const k of textos) if (d[k] !== undefined) out[k] = d[k] || null;
  if (d.chassi) out.chassi = d.chassi.toUpperCase().replace(/\s/g, "");
  if (d.renavam) out.renavam = d.renavam.replace(/\D/g, "") || null;
  if (d.tipo !== undefined) out.tipo = d.tipo;
  if (d.marca !== undefined) out.marca = d.marca;
  if (d.modelo !== undefined) out.modelo = d.modelo;
  if (d.anoFabricacao !== undefined) out.anoFabricacao = d.anoFabricacao;
  if (d.anoModelo !== undefined) out.anoModelo = d.anoModelo;
  if (d.km !== undefined) out.km = d.km;
  if (d.portas !== undefined) out.portas = d.portas ?? null;
  if (d.opcionais !== undefined) out.opcionais = [...new Set(d.opcionais)];
  if (d.fipeCents !== undefined) {
    out.fipeCents = d.fipeCents ?? null;
    out.fipeEm = d.fipeCents ? new Date() : null;
  }
  if (d.precoCents !== undefined) out.precoCents = d.precoCents;
  if (d.precoMinimoCents !== undefined) out.precoMinimoCents = d.precoMinimoCents ?? null;
  if (d.anoFabricacao !== undefined && d.anoModelo !== undefined && d.anoModelo < d.anoFabricacao) {
    throw new ErroDeVeiculo("o ano do modelo não pode ser anterior ao de fabricação");
  }
  return out;
}

/** Duas fichas do mesmo carro no pátio ao mesmo tempo é erro de digitação (ou o carro entrou duas vezes). */
export async function conferirPlacaNoPatio(db: Db, tenantId: string, placa: string | null | undefined, excetoId?: string) {
  if (!placa) return;
  const outro = await db.veiculo.findFirst({
    where: { tenantId, placa, status: { in: STATUS_NO_PATIO }, ...(excetoId ? { id: { not: excetoId } } : {}) },
    select: { id: true },
  });
  if (outro) throw new ErroDeVeiculo(`já existe um veículo com a placa ${placaParaTela(placa)} no estoque`, 409);
}

export async function registrarEvento(db: Db, veiculoId: string, tipo: string, descricao: string, porId?: string | null) {
  await db.eventoVeiculo.create({ data: { veiculoId, tipo, descricao, porId: porId ?? null } });
}

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Categoria de despesa "Compras para revenda" do plano padrão, se a empresa ainda a tiver. */
async function categoriaDeCompras(db: Db, tenantId: string): Promise<string | null> {
  const c = await db.categoriaFinanceira.findFirst({
    where: { tenantId, tipo: "DESPESA", nome: "Compras para revenda", ativa: true },
    select: { id: true },
  });
  return c?.id ?? null;
}

/** Prepara o que as transações precisam e que usa o prisma direto (o plano de categorias). */
export async function prepararFinanceiro(tenantId: string) {
  await garantirPlano(tenantId);
}

/* ------------------------------------------------------------------ custos */

type LancarCusto = {
  tenantId: string;
  veiculoId: string;
  nomeVeiculo: string;
  tipo: TipoCusto;
  descricao?: string | null;
  valorCents: number;
  data?: Date;
  pagar?: z.infer<typeof custoSchema>["pagar"];
  userId: string;
};

/**
 * Anota um custo no carro e, se pedido, lança a conta a pagar junto (quitada,
 * quando já foi pago). O custo é o que entra na margem; a conta é o que entra
 * no financeiro. Separados porque nem todo custo é uma conta nova: a troca foi
 * paga com abatimento, e há loja que lança o boleto da oficina por fora.
 */
export async function lancarCusto(db: Db, i: LancarCusto) {
  let contaPagarId: string | null = null;
  if (i.pagar) {
    const vencimento = diaAoMeioDia(new Date(i.pagar.vencimento));
    const conta = await criarContaPagar(db, {
      tenantId: i.tenantId,
      fornecedorNome: i.pagar.fornecedorNome,
      descricao: `${ROTULO_CUSTO[i.tipo]} · ${i.nomeVeiculo}${i.descricao ? ` · ${i.descricao}` : ""}`,
      categoriaId: i.tipo === "COMPRA" ? await categoriaDeCompras(db, i.tenantId) : null,
      forma: i.pagar.forma,
      plano: { totalCents: i.valorCents, numParcelas: 1, periodicidade: "MENSAL", primeiroVencimento: vencimento },
      userId: i.userId,
    });
    contaPagarId = conta.id;
    if (i.pagar.jaPago) {
      await pagarNaConta(db, { tenantId: i.tenantId, contaId: conta.id, valorCents: i.valorCents, meio: i.pagar.forma, userId: i.userId });
    }
  }
  const custo = await db.custoVeiculo.create({
    data: {
      tenantId: i.tenantId,
      veiculoId: i.veiculoId,
      tipo: i.tipo,
      descricao: i.descricao || null,
      valorCents: i.valorCents,
      data: i.data ?? new Date(),
      contaPagarId,
      createdById: i.userId,
    },
    select: { id: true },
  });
  await registrarEvento(db, i.veiculoId, "custo", `${ROTULO_CUSTO[i.tipo]}: ${brl(i.valorCents)}${contaPagarId ? " (lançado em contas a pagar)" : ""}`, i.userId);
  return custo;
}

/* ----------------------------------------------------------------- entrada */

/** Entrada de um carro no estoque: compra (com a conta a pagar) ou consignação. */
export async function registrarEntrada(input: {
  tenantId: string;
  userId: string;
  dados: z.infer<typeof entradaVeiculoSchema>;
  consignanteId: string | null;
}) {
  const d = input.dados;
  if (d.origem === "COMPRA" && !d.compra) throw new ErroDeVeiculo("informe o valor da compra");
  if (d.origem === "CONSIGNACAO" && (!d.consignacao || !input.consignanteId)) throw new ErroDeVeiculo("informe o dono do carro e o valor que ele recebe");
  const base = dadosParaBanco(d.veiculo);
  await prepararFinanceiro(input.tenantId);

  return prisma.$transaction(async (tx) => {
    await conferirPlacaNoPatio(tx, input.tenantId, base.placa as string | null | undefined);
    const status = d.disponivel ? "DISPONIVEL" : "PREPARACAO";
    const v = await tx.veiculo.create({
      data: {
        ...(base as Prisma.VeiculoUncheckedCreateInput),
        tenantId: input.tenantId,
        marca: d.veiculo.marca,
        modelo: d.veiculo.modelo,
        anoFabricacao: d.veiculo.anoFabricacao,
        anoModelo: d.veiculo.anoModelo,
        km: d.veiculo.km,
        precoCents: d.veiculo.precoCents,
        origem: d.origem,
        status,
        entradaEm: d.entradaEm ? new Date(d.entradaEm) : new Date(),
        consignanteId: d.origem === "CONSIGNACAO" ? input.consignanteId : null,
        consignacaoValorCents: d.origem === "CONSIGNACAO" ? d.consignacao!.valorLiquidoCents : null,
        consignacaoAte: d.origem === "CONSIGNACAO" && d.consignacao!.ate ? new Date(d.consignacao!.ate) : null,
      },
      select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true },
    });
    await registrarEvento(
      tx,
      v.id,
      "entrada",
      d.origem === "CONSIGNACAO" ? `Entrou em consignação (dono recebe ${brl(d.consignacao!.valorLiquidoCents)})` : "Entrou por compra",
      input.userId
    );
    if (d.origem === "COMPRA" && d.compra) {
      await lancarCusto(tx, {
        tenantId: input.tenantId,
        veiculoId: v.id,
        nomeVeiculo: nomeDoVeiculo(v),
        tipo: "COMPRA",
        valorCents: d.compra.valorCents,
        data: d.entradaEm ? new Date(d.entradaEm) : undefined,
        pagar: d.compra.pagar,
        userId: input.userId,
      });
    }
    return { id: v.id };
  });
}

/* ------------------------------------------------------------ venda: apoio */

async function carroParaVenda(db: Db, tenantId: string, veiculoId: string) {
  const v = await db.veiculo.findFirst({
    where: { id: veiculoId, tenantId },
    select: {
      id: true,
      status: true,
      origem: true,
      marca: true,
      modelo: true,
      versao: true,
      anoFabricacao: true,
      anoModelo: true,
      consignanteId: true,
      consignacaoValorCents: true,
      consignante: { select: { name: true, waName: true, phoneNumber: true } },
    },
  });
  if (!v) throw new ErroDeVeiculo("veículo não encontrado", 404);
  return v;
}

/** A reserva em aberto do carro, se houver. Só pode existir uma. */
async function reservaAberta(db: Db, veiculoId: string) {
  return db.vendaVeiculo.findFirst({
    where: { veiculoId, status: "RESERVA" },
    select: { id: true, contactId: true, sinalCents: true, contaId: true, vendedorId: true },
  });
}

/* ---------------------------------------------------------------- reserva */

/**
 * Segura o carro para um cliente, com ou sem sinal. Com sinal, nasce a conta a
 * receber da venda: o sinal como entrada já recebida (cai no Caixa do dia) e o
 * resto do preço como parcela única vencendo no fim da reserva. Ao concluir a
 * venda, essa parcela é trocada pela composição real (entrada, banco, crediário).
 */
export async function reservar(input: {
  tenantId: string;
  userId: string;
  veiculoId: string;
  contactId: string;
  dados: z.infer<typeof reservaSchema>;
}) {
  const d = input.dados;
  const sinal = d.sinalCents ?? 0;
  if (sinal > 0 && !d.meioDoSinal) throw new ErroDeVeiculo("diga como o sinal foi pago (dinheiro, Pix ou cartão)");
  if (sinal >= d.precoCents) throw new ErroDeVeiculo("o sinal cobre o carro inteiro: registre como venda");
  const vendedorId = await vendedorValido(input.tenantId, d.vendedorId === undefined ? input.userId : d.vendedorId);
  await prepararFinanceiro(input.tenantId);

  return prisma.$transaction(async (tx) => {
    const v = await carroParaVenda(tx, input.tenantId, input.veiculoId);
    if (v.status !== "DISPONIVEL" && v.status !== "PREPARACAO") throw new ErroDeVeiculo("este carro não está à venda", 409);
    if (await reservaAberta(tx, v.id)) throw new ErroDeVeiculo("este carro já tem uma reserva", 409);
    const nome = nomeDoVeiculo(v);
    const ate = diaAoMeioDia(new Date(d.reservadaAte));

    let contaId: string | null = null;
    if (sinal > 0) {
      const conta = await tx.contaReceber.create({
        data: {
          tenantId: input.tenantId,
          contactId: input.contactId,
          origem: "MANUAL",
          descricao: `Venda ${nome}`,
          categoriaId: await categoriaDeVendas(tx, input.tenantId),
          createdById: input.userId,
          parcelas: {
            create: [
              { tenantId: input.tenantId, numero: 1, totalParcelas: 1, tipo: "ENTRADA", vencimento: diaAoMeioDia(new Date()), valorCents: sinal, observacao: "Sinal" },
              { tenantId: input.tenantId, numero: 1, totalParcelas: 1, tipo: "UNICA", vencimento: ate, valorCents: d.precoCents - sinal, observacao: "Saldo da reserva" },
            ],
          },
        },
        select: { id: true, parcelas: { select: { id: true, tipo: true } } },
      });
      contaId = conta.id;
      await receberNaConta(tx, {
        tenantId: input.tenantId,
        contaId: conta.id,
        parcelaId: conta.parcelas.find((p) => p.tipo === "ENTRADA")!.id,
        valorCents: sinal,
        meio: d.meioDoSinal as PaymentMethod,
        observacao: `Sinal · ${nome}`,
        userId: input.userId,
      });
    }

    const venda = await tx.vendaVeiculo.create({
      data: {
        tenantId: input.tenantId,
        veiculoId: v.id,
        contactId: input.contactId,
        vendedorId,
        status: "RESERVA",
        precoCents: d.precoCents,
        sinalCents: sinal,
        reservadaAte: ate,
        contaId,
        observacoes: d.observacoes || null,
      },
      select: { id: true },
    });
    await tx.veiculo.update({ where: { id: v.id }, data: { status: "RESERVADO", statusDesde: new Date() } });
    await registrarEvento(tx, v.id, "reserva", `Reservado${sinal ? ` com sinal de ${brl(sinal)}` : " sem sinal"} até ${ate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`, input.userId);
    return venda;
  });
}

/**
 * Desfaz a reserva. `devolverSinal`: o sinal é estornado e a conta cancelada.
 * Sem devolver, a loja fica com o sinal (o cliente desistiu) e só o saldo
 * deixa de ser cobrado.
 */
export async function cancelarReserva(input: { tenantId: string; userId: string; veiculoId: string; motivo?: string | null; devolverSinal: boolean }) {
  return prisma.$transaction(async (tx) => {
    const v = await carroParaVenda(tx, input.tenantId, input.veiculoId);
    const r = await reservaAberta(tx, v.id);
    if (!r) throw new ErroDeVeiculo("este carro não tem reserva", 409);
    if (r.contaId) {
      await encerrarConta(tx, { tenantId: input.tenantId, contaId: r.contaId, devolverSinal: input.devolverSinal, motivo: input.motivo, userId: input.userId });
    }
    await tx.vendaVeiculo.update({ where: { id: r.id }, data: { status: "CANCELADA", canceladaEm: new Date(), motivoCancelamento: input.motivo || null } });
    await tx.veiculo.update({ where: { id: v.id }, data: { status: "DISPONIVEL", statusDesde: new Date() } });
    const sinal = r.sinalCents ? (input.devolverSinal ? `, sinal de ${brl(r.sinalCents)} devolvido` : `, loja ficou com o sinal de ${brl(r.sinalCents)}`) : "";
    await registrarEvento(tx, v.id, "reserva", `Reserva cancelada${input.motivo ? ` (${input.motivo})` : ""}${sinal}`, input.userId);
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ venda */

/**
 * Fecha a venda. O preço é pago por:
 *
 *   troca (outro carro, que entra no estoque) + sinal (já recebido na reserva)
 *   + entrada (recebida agora) + financiado (o banco paga a loja)
 *   + restante (crediário da loja, em parcelas)
 *
 * Na conta a receber, a troca não é dinheiro: a conta vale preço − troca. O
 * financiamento é uma parcela própria (o banco é quem paga, mas a dívida é da
 * venda deste cliente, e é aqui que a loja confere se o banco depositou).
 *
 * Consignado: lança na mesma transação a conta a pagar do repasse ao dono.
 */
export async function vender(input: {
  tenantId: string;
  userId: string;
  veiculoId: string;
  /** null = concluir a reserva em aberto. */
  contactId: string | null;
  dados: z.infer<typeof vendaSchema>;
}) {
  const d = input.dados;
  const entrada = d.entradaCents ?? 0;
  const financiado = d.financiadoCents ?? 0;
  const troca = d.troca?.valorCents ?? 0;
  if (entrada > 0 && !d.meioDaEntrada) throw new ErroDeVeiculo("diga como a entrada foi paga");
  if (financiado > 0 && !d.vencimentoFinanciamento) throw new ErroDeVeiculo("informe quando o banco paga o financiamento");
  const trocaDados = d.troca ? dadosParaBanco({ ...d.troca.veiculo, precoCents: d.troca.veiculo.precoCents ?? 0 }) : null;
  const vendedorIdPedido = d.vendedorId;
  await prepararFinanceiro(input.tenantId);

  return prisma.$transaction(async (tx) => {
    const v = await carroParaVenda(tx, input.tenantId, input.veiculoId);
    const reserva = await reservaAberta(tx, v.id);
    if (input.contactId === null && !reserva) throw new ErroDeVeiculo("este carro não tem reserva para concluir", 409);
    if (input.contactId !== null && reserva) throw new ErroDeVeiculo("este carro está reservado: conclua a reserva ou cancele-a antes", 409);
    if (!reserva && v.status !== "DISPONIVEL" && v.status !== "PREPARACAO") throw new ErroDeVeiculo("este carro não está à venda", 409);
    const contactId = reserva?.contactId ?? input.contactId!;
    const sinal = reserva?.sinalCents ?? 0;

    let restante: number;
    try {
      restante = restanteDaVenda({ precoCents: d.precoCents, trocaCents: troca, sinalCents: sinal, entradaCents: entrada, financiadoCents: financiado });
    } catch (e) {
      throw new ErroDeVeiculo((e as Error).message);
    }
    if (restante > 0 && !d.restante) throw new ErroDeVeiculo(`faltam ${brl(restante)}: diga como o cliente paga o restante`);

    const nome = nomeDoVeiculo(v);
    const hoje = diaAoMeioDia(new Date());
    const vendedorId = await (async () => {
      const id = vendedorIdPedido === undefined ? reserva?.vendedorId ?? input.userId : vendedorIdPedido;
      if (!id) return null;
      const u = await tx.user.findFirst({ where: { id, tenantId: input.tenantId }, select: { id: true } });
      return u?.id ?? null;
    })();

    // ---- a conta a receber (preço − troca)
    const aReceber = d.precoCents - troca;
    let contaId = reserva?.contaId ?? null;
    if (contaId) {
      // A reserva deixou a parcela "saldo da reserva" em aberto: sai, e entra a composição real.
      const parcelas = await tx.parcela.findMany({ where: { contaId, tenantId: input.tenantId }, select: SELECT_PARCELAS });
      for (const p of parcelas) {
        const pago = p.pagamentos.reduce((s, x) => s + x.valorCents, 0);
        if (!p.canceladaEm && !p.reembolsadaEm && pago === 0) await cancelarParcela(tx, { tenantId: input.tenantId, parcelaId: p.id });
      }
    } else if (aReceber > 0) {
      const conta = await tx.contaReceber.create({
        data: {
          tenantId: input.tenantId,
          contactId,
          origem: "MANUAL",
          descricao: `Venda ${nome}`,
          categoriaId: await categoriaDeVendas(tx, input.tenantId),
          createdById: input.userId,
        },
        select: { id: true },
      });
      contaId = conta.id;
    }

    if (contaId) {
      const novas: Prisma.ParcelaCreateManyInput[] = [];
      if (entrada > 0) novas.push({ tenantId: input.tenantId, contaId, numero: 1, totalParcelas: 1, tipo: "ENTRADA", vencimento: hoje, valorCents: entrada, observacao: "Entrada" });
      if (financiado > 0) {
        novas.push({
          tenantId: input.tenantId,
          contaId,
          numero: 1,
          totalParcelas: 1,
          tipo: "UNICA",
          vencimento: diaAoMeioDia(new Date(d.vencimentoFinanciamento!)),
          valorCents: financiado,
          observacao: `Financiamento${d.banco ? ` · ${d.banco}` : ""}`,
        });
      }
      if (restante > 0 && d.restante) {
        let plano;
        try {
          plano = gerarParcelas({
            totalCents: restante,
            numParcelas: d.restante.numParcelas,
            periodicidade: d.restante.periodicidade,
            primeiroVencimento: new Date(d.restante.primeiroVencimento),
          });
        } catch (e) {
          throw new ErroDeVeiculo((e as Error).message);
        }
        for (const p of plano) {
          novas.push({ tenantId: input.tenantId, contaId, ...p, tipo: plano.length === 1 ? "UNICA" : p.tipo, observacao: "Crediário da loja" });
        }
      }
      if (novas.length) await tx.parcela.createMany({ data: novas });
      await sincronizarConta(tx, contaId);
      if (entrada > 0) {
        const parcelaEntrada = await tx.parcela.findFirst({
          where: { contaId, tipo: "ENTRADA", observacao: "Entrada", canceladaEm: null },
          orderBy: { id: "desc" },
          select: { id: true },
        });
        await receberNaConta(tx, {
          tenantId: input.tenantId,
          contaId,
          parcelaId: parcelaEntrada?.id,
          valorCents: entrada,
          meio: d.meioDaEntrada as PaymentMethod,
          observacao: `Entrada · ${nome}`,
          userId: input.userId,
        });
      }
    }

    // ---- a venda
    const dadosVenda = {
      vendedorId,
      status: "CONCLUIDA" as const,
      precoCents: d.precoCents,
      trocaCents: troca,
      entradaCents: entrada,
      financiadoCents: financiado,
      banco: d.banco || null,
      comissaoCents: d.comissaoCents ?? null,
      contaId,
      observacoes: d.observacoes ?? undefined,
      concluidaEm: new Date(),
    };
    const venda = reserva
      ? await tx.vendaVeiculo.update({ where: { id: reserva.id }, data: dadosVenda, select: { id: true } })
      : await tx.vendaVeiculo.create({ data: { ...dadosVenda, tenantId: input.tenantId, veiculoId: v.id, contactId }, select: { id: true } });

    // ---- consignado: o repasse ao dono
    if (v.origem === "CONSIGNACAO" && v.consignacaoValorCents) {
      const dono = v.consignante?.name ?? v.consignante?.waName ?? v.consignante?.phoneNumber ?? "Dono do consignado";
      const conta = await criarContaPagar(tx, {
        tenantId: input.tenantId,
        fornecedorNome: dono,
        descricao: `Repasse do consignado · ${nome}`,
        categoriaId: await categoriaDeCompras(tx, input.tenantId),
        forma: "PIX",
        plano: {
          totalCents: v.consignacaoValorCents,
          numParcelas: 1,
          periodicidade: "MENSAL",
          primeiroVencimento: diaAoMeioDia(d.vencimentoRepasse ? new Date(d.vencimentoRepasse) : new Date()),
        },
        userId: input.userId,
      });
      await tx.vendaVeiculo.update({ where: { id: venda.id }, data: { repasseContaPagarId: conta.id } });
    }

    // ---- a troca entra no estoque, com o valor dela como custo (pago com abatimento, sem conta a pagar)
    let trocaId: string | null = null;
    if (d.troca && trocaDados) {
      await conferirPlacaNoPatio(tx, input.tenantId, trocaDados.placa as string | null | undefined);
      const t = await tx.veiculo.create({
        data: {
          ...(trocaDados as Prisma.VeiculoUncheckedCreateInput),
          tenantId: input.tenantId,
          marca: d.troca.veiculo.marca,
          modelo: d.troca.veiculo.modelo,
          anoFabricacao: d.troca.veiculo.anoFabricacao,
          anoModelo: d.troca.veiculo.anoModelo,
          km: d.troca.veiculo.km,
          precoCents: d.troca.veiculo.precoCents ?? 0,
          origem: "TROCA",
          status: "PREPARACAO",
          vendaDeOrigemId: venda.id,
        },
        select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true },
      });
      trocaId = t.id;
      await registrarEvento(tx, t.id, "entrada", `Entrou como troca na venda do ${nome} (${brl(troca)})`, input.userId);
      await lancarCusto(tx, { tenantId: input.tenantId, veiculoId: t.id, nomeVeiculo: nomeDoVeiculo(t), tipo: "COMPRA", descricao: "Troca", valorCents: troca, userId: input.userId });
    }

    await tx.veiculo.update({ where: { id: v.id }, data: { status: "VENDIDO", statusDesde: new Date(), saidaEm: new Date() } });
    const partes = [
      troca ? `troca ${brl(troca)}` : "",
      sinal ? `sinal ${brl(sinal)}` : "",
      entrada ? `entrada ${brl(entrada)}` : "",
      financiado ? `financiado ${brl(financiado)}${d.banco ? ` (${d.banco})` : ""}` : "",
      restante ? `crediário ${brl(restante)}` : "",
    ].filter(Boolean);
    await registrarEvento(tx, v.id, "venda", `Vendido por ${brl(d.precoCents)}${partes.length ? `: ${partes.join(", ")}` : ""}`, input.userId);
    return { id: venda.id, trocaId };
  });
}

/* ----------------------------------------------------------- WhatsApp */

const MIME_POR_EXTENSAO: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Manda o carro para o cliente: a ficha como legenda da capa e as outras
 * fotos em seguida. Pela fila de saída normal, como o aviso da ótica: respeita
 * bloqueio, aparece na conversa do Inbox e a resposta cai nela.
 *
 * Com `conversationId` (botão no Inbox) vai na conversa aberta; com
 * `contactId` (botão na ficha do carro) sai pelo número geral da loja.
 */
export async function enviarVeiculo(input: {
  tenantId: string;
  userId: string;
  veiculoId: string;
  conversation: { id: string; sessionId: string; setorId: string | null } | null;
  contactId: string | null;
  fotos: number;
}): Promise<{ mensagens: number }> {
  const v = await prisma.veiculo.findFirst({
    where: { id: input.veiculoId, tenantId: input.tenantId },
    include: { fotos: { orderBy: { ordem: "asc" }, take: Math.max(input.fotos, 1) } },
  });
  if (!v) throw new ErroDeVeiculo("veículo não encontrado", 404);
  if (v.status === "VENDIDO" || v.status === "DEVOLVIDO") throw new ErroDeVeiculo("este carro não está mais à venda", 409);

  let conversa = input.conversation;
  if (!conversa) {
    const contato = await prisma.contact.findFirst({ where: { id: input.contactId ?? "", tenantId: input.tenantId }, select: { id: true, grupo: true } });
    if (!contato) throw new ErroDeVeiculo("cliente não encontrado", 404);
    if (contato.grupo) throw new ErroDeVeiculo("escolha um cliente, não um grupo");
    const session = await numeroGeral(input.tenantId);
    if (!session) throw new ErroDeVeiculo("nenhum número de WhatsApp conectado", 409);
    conversa = await prisma.conversation.upsert({
      where: { contactId_sessionId: { contactId: contato.id, sessionId: session.id } },
      update: {},
      create: { tenantId: input.tenantId, contactId: contato.id, sessionId: session.id },
      select: { id: true, sessionId: true, setorId: true },
    });
  }

  const ficha = fichaParaCliente(v);
  const fotos = input.fotos > 0 ? v.fotos.slice(0, input.fotos) : [];
  const base = {
    conversationId: conversa.id,
    sessionId: conversa.sessionId,
    direction: "OUTBOUND" as const,
    status: "PENDING" as const,
    senderUserId: input.userId,
    setorId: conversa.setorId,
  };
  // createdAt explícito e crescente: o worker manda na ordem de criação, e a
  // capa com a ficha tem que chegar antes das outras fotos.
  const agora = Date.now();
  const mensagens: Prisma.MessageCreateManyInput[] = fotos.length
    ? fotos.map((f, i) => {
        const ext = f.key.slice(f.key.lastIndexOf(".") + 1).toLowerCase();
        return {
          ...base,
          body: i === 0 ? ficha : "",
          mediaType: "IMAGE" as const,
          mediaKey: f.key,
          mediaMimeType: MIME_POR_EXTENSAO[ext] ?? "image/jpeg",
          mediaFileName: `${v.marca}-${v.modelo}-${i + 1}.${ext}`,
          createdAt: new Date(agora + i),
        };
      })
    : [{ ...base, body: ficha, createdAt: new Date(agora) }];

  await prisma.message.createMany({ data: mensagens });
  await prisma.conversation.update({ where: { id: conversa.id }, data: { lastMessageAt: new Date() } });
  await registrarEvento(prisma, v.id, "envio", `Enviado pelo WhatsApp (${fotos.length} foto${fotos.length === 1 ? "" : "s"})`, input.userId);
  await wakeOutbox(input.tenantId);
  return { mensagens: mensagens.length };
}

/* ------------------------------------------------------------- leitura */

/** O dinheiro de uma venda para a ficha: recebido e o que falta. */
export async function resumoDaVenda(contaId: string | null) {
  if (!contaId) return null;
  const parcelas = await prisma.parcela.findMany({ where: { contaId }, select: SELECT_PARCELAS });
  return resumoDasParcelas(parcelas);
}

export { ErroDeConta };
