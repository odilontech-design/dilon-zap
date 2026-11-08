import { NextResponse } from "next/server";
import { prisma, type Prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { upsertContactByPhone } from "@/lib/contact-server";
import { configDaOtica, consultorValido, dadosDoCliente, previsaoDaTela, reservarNumeroOS } from "@/lib/otica";
import { criarContaDaOS, parcelasParaTela, prepararFinanceiro, resumoDasParcelas, SELECT_PARCELAS } from "@/lib/otica-financeiro";
import { ErroDeConta } from "@/lib/contas-receber";
import { baixarParaOS } from "@/lib/otica-estoque";
import { validadeDaReceita } from "@/lib/otica-regras";
import { criarOSSchema, paraData, telefoneParaWhatsApp } from "@/lib/otica-schemas";

/**
 * Ordens de serviço da ótica.
 *
 * A lista do quadro traz tudo que ainda está andando e as entregues dos
 * últimos 30 dias: a coluna "Entregue" serve para conferir a semana, não para
 * guardar o histórico inteiro na tela. Com busca, procura em todas.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const digitos = q.replace(/\D/g, "");
  const ha30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const where: Prisma.OrdemServicoWhereInput = q
    ? {
        tenantId: user.tenantId,
        OR: [
          // Número de OS tem no máximo 7 dígitos; um CPF inteiro estouraria o inteiro do banco.
          ...(digitos && digitos.length <= 7 ? [{ numero: Number(digitos) }] : []),
          { contact: { name: { contains: q, mode: "insensitive" } } },
          ...(digitos.length >= 4 ? [{ contact: { phoneNumber: { contains: digitos } } }, { contact: { documento: { contains: digitos } } }] : []),
          { pedidoLaboratorio: { contains: q, mode: "insensitive" } },
        ],
      }
    : {
        tenantId: user.tenantId,
        OR: [{ etapa: { notIn: ["ENTREGUE", "CANCELADA"] } }, { etapa: "ENTREGUE", entregueEm: { gte: ha30dias } }],
      };

  const ordens = await prisma.ordemServico.findMany({
    where,
    orderBy: [{ previsaoEntrega: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
    take: q ? 50 : 500,
    select: {
      id: true,
      numero: true,
      etapa: true,
      etapaDesde: true,
      previsaoEntrega: true,
      lentes: true,
      armacao: true,
      valorCents: true,
      sinalCents: true,
      pedidoLaboratorio: true,
      // O dinheiro vem das parcelas da conta a receber.
      conta: { select: { parcelas: { select: SELECT_PARCELAS } } },
      contact: { select: { id: true, name: true, waName: true, phoneNumber: true } },
      laboratorio: { select: { nome: true } },
      consultor: { select: { name: true } },
    },
  });

  return NextResponse.json(
    ordens.map(({ conta, ...o }) => {
      // OS sem conta (sem valor lançado) não deve nada.
      const r = conta ? resumoDasParcelas(conta.parcelas) : null;
      return { ...o, recebidoCents: r?.recebidoCents ?? 0, saldoCents: r?.saldoCents ?? 0 };
    })
  );
}

export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const parsed = criarOSSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // Cliente: o escolhido na busca ou um novo pelo telefone. O novo é criado
  // fora da transação porque resolver o número no WhatsApp é uma chamada ao
  // worker, e transação aberta esperando rede segura conexão do banco.
  let contactId = d.contactId;
  if (contactId) {
    const existe = await prisma.contact.findFirst({ where: { id: contactId, tenantId: user.tenantId }, select: { id: true } });
    if (!existe) return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
  } else if (d.novoCliente) {
    const digitos = telefoneParaWhatsApp(d.novoCliente.telefone);
    if (digitos.length < 12) return NextResponse.json({ error: "telefone inválido: use DDD + número" }, { status: 400 });
    const { contact } = await upsertContactByPhone(user.tenantId, digitos, d.novoCliente.nome);
    contactId = contact.id;
  }
  if (!contactId) return NextResponse.json({ error: "escolha o cliente" }, { status: 400 });

  if (d.laboratorioId) {
    const lab = await prisma.laboratorio.findFirst({ where: { id: d.laboratorioId, tenantId: user.tenantId }, select: { id: true } });
    if (!lab) return NextResponse.json({ error: "laboratório não encontrado" }, { status: 404 });
  }
  if (d.receitaId) {
    const r = await prisma.receitaOtica.findFirst({ where: { id: d.receitaId, tenantId: user.tenantId, contactId }, select: { id: true } });
    if (!r) return NextResponse.json({ error: "receita não encontrada para este cliente" }, { status: 404 });
  }
  const consultorId = await consultorValido(user.tenantId, d.consultorId === undefined ? user.id : d.consultorId);

  const cfg = await configDaOtica(user.tenantId);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { timezone: true } });
  await prepararFinanceiro(user.tenantId);
  const previsao = previsaoDaTela(d.previsao, tenant.timezone) ?? null;

  let ordem;
  try {
    ordem = await prisma.$transaction(async (tx) => {
    if (d.cliente) await tx.contact.update({ where: { id: contactId }, data: dadosDoCliente(d.cliente) });

    let receitaId = d.receitaId ?? null;
    if (!receitaId && d.receita) {
      const consulta = paraData(d.receita.dataConsulta) ?? null;
      const receita = await tx.receitaOtica.create({
        data: {
          tenantId: user.tenantId,
          contactId: contactId!,
          usuarioNome: d.receita.usuarioNome || null,
          usuarioNascimento: paraData(d.receita.usuarioNascimento) ?? null,
          medico: d.receita.medico || null,
          crm: d.receita.crm || null,
          dataConsulta: consulta,
          validaAte: validadeDaReceita(consulta ?? new Date(), cfg.validadeReceitaMeses),
          graus: d.receita.graus,
          observacoes: d.receita.observacoes || null,
        },
        select: { id: true },
      });
      receitaId = receita.id;
    }

    const numero = await reservarNumeroOS(tx, user.tenantId);
    const criada = await tx.ordemServico.create({
      data: {
        tenantId: user.tenantId,
        numero,
        contactId: contactId!,
        receitaId,
        laboratorioId: d.laboratorioId || null,
        pedidoLaboratorio: d.pedidoLaboratorio || null,
        consultorId,
        previsaoEntrega: previsao,
        lentes: d.lentes || null,
        materialLente: d.materialLente || null,
        indiceLente: d.indiceLente || null,
        tratamentos: d.tratamentos ?? [],
        tratamentoCor: d.tratamentoCor || null,
        armacao: d.armacao || null,
        armacaoEstoqueId: d.armacaoEstoqueId || null,
        materialArmacao: d.materialArmacao || null,
        servicos: d.servicos ?? [],
        medidas: d.medidas ?? undefined,
        observacoes: d.observacoes || null,
        valorCents: d.valorCents ?? 0,
        sinalCents: Math.min(d.sinalCents ?? 0, d.valorCents ?? 0),
        portadorAutorizado: d.portadorAutorizado || null,
      },
      select: { id: true, numero: true },
    });
    await tx.eventoOS.create({ data: { ordemId: criada.id, para: "ABERTA", porId: user.id } });

    // A armação escolhida do estoque é vendida: sai da lista de disponíveis.
    // Falha (peça já vendida) derruba a OS inteira, e o número reservado volta.
    if (d.armacaoEstoqueId) {
      await baixarParaOS(tx, { tenantId: user.tenantId, armacaoId: d.armacaoEstoqueId, ordemId: criada.id, numeroOS: numero, userId: user.id });
    }

    // O dinheiro: a venda vira conta a receber, com o sinal já recebido.
    const cliente = await tx.contact.findUniqueOrThrow({ where: { id: contactId! }, select: { name: true, waName: true } });
    await criarContaDaOS(tx, {
      tenantId: user.tenantId,
      ordemId: criada.id,
      numero,
      contactId: contactId!,
      nomeCliente: cliente.name ?? cliente.waName,
      valorCents: d.valorCents ?? 0,
      sinalCents: d.sinalCents ?? 0,
      meioDoSinal: d.meioDoSinal ?? null,
      vencimentoDoSaldo: previsao,
      userId: user.id,
    });
    return criada;
  });
  } catch (e) {
    if (e instanceof ErroDeConta) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  return NextResponse.json(ordem, { status: 201 });
}
