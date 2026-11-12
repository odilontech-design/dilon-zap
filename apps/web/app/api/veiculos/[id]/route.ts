import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { editarVeiculoSchema } from "@/lib/veiculos-schemas";
import { ErroDeVeiculo, conferirPlacaNoPatio, dadosParaBanco, registrarEvento, resumoDaVenda } from "@/lib/veiculos";
import { parcelasParaTela, SELECT_PARCELAS } from "@/lib/otica-financeiro";
import {
  ROTULO_STATUS,
  custoTotal,
  diasEmEstoque,
  diferencaFipe,
  margem,
  podeMudarStatus,
  type OrigemVeiculo,
  type StatusVeiculo,
} from "@/lib/veiculos-regras";
import { SEM_PERMISSAO, respostaDeErro } from "@/lib/veiculos-api";
import { linkPublicoDoCarro } from "@/lib/vitrine";

/**
 * A ficha do carro: dados, fotos, custos, venda e histórico. Para quem não é
 * da gestão, saem custo, margem, piso de negociação, valor do consignado e as
 * observações internas (o vendedor vê o preço de anúncio e a ficha).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  const gerencia = ehGerencia(user.role);

  const v = await prisma.veiculo.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      fotos: { orderBy: { ordem: "asc" }, select: { id: true, ordem: true } },
      custos: { orderBy: { data: "asc" }, select: { id: true, tipo: true, descricao: true, valorCents: true, data: true, contaPagarId: true } },
      consignante: { select: { id: true, name: true, waName: true, phoneNumber: true } },
      vendaDeOrigem: { select: { id: true, veiculoId: true } },
      vendas: {
        orderBy: { createdAt: "desc" },
        include: {
          contact: { select: { id: true, name: true, waName: true, phoneNumber: true } },
          vendedor: { select: { name: true } },
          conta: { select: { id: true, parcelas: { select: SELECT_PARCELAS } } },
          trocas: { select: { id: true, marca: true, modelo: true, anoModelo: true, placa: true } },
        },
      },
      eventos: { orderBy: { createdAt: "desc" }, take: 100, include: { por: { select: { name: true } } } },
    },
  });
  if (!v) return NextResponse.json({ error: "veículo não encontrado" }, { status: 404 });

  const custo = custoTotal(v.custos.map((c) => c.valorCents), v.consignacaoValorCents);
  const vendaAtiva = v.vendas.find((x) => x.status !== "CANCELADA") ?? null;
  const preco = v.status === "VENDIDO" && vendaAtiva ? vendaAtiva.precoCents : v.precoCents;
  const comissao = v.status === "VENDIDO" ? vendaAtiva?.comissaoCents ?? 0 : 0;

  const { custos, consignacaoValorCents, precoMinimoCents, observacoesInternas, ...resto } = v;
  return NextResponse.json({
    ...resto,
    gerencia,
    dias: diasEmEstoque(v.entradaEm, v.saidaEm),
    diferencaFipe: diferencaFipe(v.precoCents, v.fipeCents),
    linkVitrine: await linkPublicoDoCarro(user.tenantId, v),
    vendas: await Promise.all(
      v.vendas.map(async ({ conta, ...venda }) => ({
        ...venda,
        financeiro: conta ? { contaId: conta.id, resumo: await resumoDaVenda(conta.id), parcelas: parcelasParaTela(conta.parcelas) } : null,
      }))
    ),
    ...(gerencia
      ? { custos, consignacaoValorCents, precoMinimoCents, observacoesInternas, custoCents: custo, margem: margem(preco, custo, comissao) }
      : { consignacaoValorCents: null, consignante: null }),
  });
}

/** Edita a ficha e muda o status (preparação ↔ disponível, devolver consignado). Só a gestão. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const parsed = editarVeiculoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { status, consignacaoValorCents, consignacaoAte, ...dados } = parsed.data;

  try {
    const atual = await prisma.veiculo.findFirst({
      where: { id: params.id, tenantId: user.tenantId },
      select: { id: true, status: true, origem: true, precoCents: true, km: true, kmInformado: true, anoFabricacao: true, anoModelo: true },
    });
    if (!atual) throw new ErroDeVeiculo("veículo não encontrado", 404);
    const base = dadosParaBanco({ anoFabricacao: atual.anoFabricacao, anoModelo: atual.anoModelo, ...dados });
    if (status && !podeMudarStatus(atual.status as StatusVeiculo, status, atual.origem as OrigemVeiculo)) {
      throw new ErroDeVeiculo(`não dá para passar de "${ROTULO_STATUS[atual.status as StatusVeiculo]}" para "${ROTULO_STATUS[status]}" por aqui`, 409);
    }
    // Carro importado do site chega sem preço e/ou sem quilometragem: não vai à
    // venda (nem à vitrine e aos portais) até a ficha ter os dois.
    const precoFinal = dados.precoCents ?? atual.precoCents;
    const kmInformado = atual.kmInformado || (dados.km !== undefined && (dados.km > 0 || dados.km !== atual.km));
    if (status === "DISPONIVEL" && atual.status === "PREPARACAO") {
      const faltas = [precoFinal <= 0 && "o preço", !kmInformado && "a quilometragem"].filter(Boolean);
      if (faltas.length) throw new ErroDeVeiculo(`informe ${faltas.join(" e ")} antes de colocar o carro à venda`, 409);
    }
    if (atual.origem !== "CONSIGNACAO" && (consignacaoValorCents !== undefined || consignacaoAte !== undefined)) {
      throw new ErroDeVeiculo("este carro não é consignado");
    }

    await prisma.$transaction(async (tx) => {
      if (base.placa !== undefined) await conferirPlacaNoPatio(tx, user.tenantId, base.placa as string | null, atual.id);
      await tx.veiculo.update({
        where: { id: atual.id },
        data: {
          ...base,
          ...(!atual.kmInformado && kmInformado ? { kmInformado: true } : {}),
          ...(status ? { status, statusDesde: new Date(), saidaEm: status === "DEVOLVIDO" ? new Date() : null } : {}),
          ...(consignacaoValorCents !== undefined ? { consignacaoValorCents } : {}),
          ...(consignacaoAte !== undefined ? { consignacaoAte: consignacaoAte ? new Date(consignacaoAte) : null } : {}),
        },
      });
      if (status) await registrarEvento(tx, atual.id, "status", `${ROTULO_STATUS[atual.status as StatusVeiculo]} → ${ROTULO_STATUS[status]}`, user.id);
      if (dados.precoCents !== undefined && dados.precoCents !== atual.precoCents) {
        const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        await registrarEvento(tx, atual.id, "preco", `Preço ${brl(atual.precoCents)} → ${brl(dados.precoCents)}`, user.id);
      }
    });
    await logAudit({ actor: user, action: "veiculo.editar", metadata: { veiculoId: atual.id, status } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
