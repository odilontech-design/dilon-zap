import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { deleteMedia } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { pendenciaDoContato } from "@/lib/contas-receber";
import { podeVerPendencia, recursosDoUsuario } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import {
  ErroDeNegocio,
  ganharNegociacao,
  moverNegociacao,
  perderNegociacao,
  reabrirNegociacao,
  recalcularValores,
} from "@/lib/negociacoes";

async function daEmpresa(id: string, tenantId: string) {
  return prisma.negociacao.findFirst({ where: { id, tenantId } });
}

/**
 * Tudo que a página da negociação mostra, num pedido só: os campos, o funil
 * com as etapas (a régua do topo), o contato, a linha do tempo (etapas,
 * anotações e arquivos) e as listas de apoio dos campos.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const n = await prisma.negociacao.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      funil: { select: { id: true, nome: true } },
      contact: {
        select: { id: true, name: true, phoneNumber: true, waJid: true, avatarUrl: true, email: true, documento: true, endereco: true },
      },
      responsavel: { select: { id: true, name: true } },
      motivoPerda: { select: { id: true, nome: true } },
      eventos: { orderBy: { em: "desc" } },
      notas: { orderBy: { em: "desc" }, select: { id: true, texto: true, porUserId: true, porNome: true, em: true } },
      anexos: {
        orderBy: { criadoEm: "desc" },
        select: { id: true, nome: true, mimeType: true, tamanhoBytes: true, porUserId: true, porNome: true, criadoEm: true },
      },
      _count: { select: { itens: true } },
      // Pedidos nascidos desta negociação: a ponte de volta com Pedidos.
      pedidos: { orderBy: { numero: "desc" }, select: { id: true, numero: true, status: true, totalCents: true, pago: true } },
    },
  });
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });

  const [etapas, usuarios, motivos, origensBrutas, pendencia] = await Promise.all([
    prisma.stage.findMany({ where: { funilId: n.funilId }, orderBy: { position: "asc" } }),
    prisma.user.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.motivoDePerda.findMany({ where: { tenantId: user.tenantId }, select: { id: true, nome: true, ativo: true } }),
    prisma.negociacao.findMany({
      where: { tenantId: user.tenantId, origem: { not: null } },
      distinct: ["origem"],
      select: { origem: true },
    }),
    podeVerPendencia(user).then((pode) => (pode ? pendenciaDoContato(user.tenantId, n.contactId) : null)),
  ]);

  const c = n.contact;
  return NextResponse.json({
    negociacao: {
      id: n.id,
      titulo: n.titulo,
      stageId: n.stageId,
      status: n.status,
      valorCents: n.valorCents,
      recorrencia: n.recorrencia,
      valorMensalCents: n.valorMensalCents,
      origem: n.origem,
      previsaoFechamento: n.previsaoFechamento,
      etapaDesde: n.etapaDesde,
      createdAt: n.createdAt,
      fechadaEm: n.fechadaEm,
      motivoPerdaId: n.motivoPerdaId,
      detalhePerda: n.detalhePerda,
      pagamento: n.pagForma
        ? {
            forma: n.pagForma,
            entradaCents: n.pagEntradaCents,
            numParcelas: n.pagNumParcelas,
            periodicidade: n.pagPeriodicidade,
            primeiroVencimento: n.pagPrimeiroVencimento ? n.pagPrimeiroVencimento.toISOString().slice(0, 10) : null,
          }
        : null,
      proximaTarefa: null,
      tarefasAtrasadas: 0,
      contato: {
        id: c.id,
        nome: c.name,
        telefone: c.phoneNumber ?? (c.waJid.endsWith("@s.whatsapp.net") ? c.waJid.split("@")[0] : null),
        avatarUrl: c.avatarUrl,
        email: c.email,
        documento: c.documento,
        endereco: c.endereco,
        pendencia: pendencia && pendencia.saldoCents > 0 ? pendencia : null,
      },
      responsavel: n.responsavel,
    },
    funil: n.funil,
    etapas: etapas.map((e) => ({ id: e.id, nome: e.name, cor: e.color, position: e.position, probabilidade: e.probabilidade })),
    usuarios,
    motivos,
    origens: origensBrutas.map((o) => o.origem!).sort(),
    eventos: n.eventos,
    notas: n.notas,
    anexos: n.anexos,
    // Atendente sem Pedidos (empresa que reservou isso à gerência) não vê valores.
    pedidos: (await recursosDoUsuario(user)).has("PEDIDOS") || user.role === "SUPERADMIN" ? n.pedidos : [],
    itens: n._count.itens,
  });
}

const schema = z.object({
  // Mudanças de estado: cada uma grava o histórico.
  acao: z.enum(["mover", "ganhar", "perder", "reabrir"]).optional(),
  stageId: z.string().optional(),
  motivoPerdaId: z.string().nullable().optional(),
  detalhe: z.string().trim().max(500).nullable().optional(),
  // Edição de campos.
  titulo: z.string().trim().min(1).max(120).optional(),
  valorCents: z.number().int().min(0).max(10_000_000_000).optional(),
  recorrencia: z.enum(["UNICA", "MENSAL"]).optional(),
  responsavelId: z.string().nullable().optional(),
  origem: z.string().trim().max(60).nullable().optional(),
  previsaoFechamento: z.string().nullable().optional(),
  // Condição de pagamento combinada; null limpa. Vai para o pedido gerado.
  pagamento: z
    .object({
      forma: z.enum(["PIX", "PIX_PENDENTE", "CARTAO", "DINHEIRO", "BOLETO", "FIADO"]),
      entradaCents: z.number().int().min(0).max(10_000_000_000).optional(),
      numParcelas: z.number().int().min(1).max(60).optional(),
      periodicidade: z.enum(["SEMANAL", "QUINZENAL", "MENSAL"]).optional(),
      primeiroVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .nullable()
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const n = await daEmpresa(params.id, user.tenantId);
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });

  try {
    if (d.responsavelId) {
      const resp = await prisma.user.findFirst({ where: { id: d.responsavelId, tenantId: user.tenantId }, select: { id: true } });
      if (!resp) return NextResponse.json({ error: "responsável inválido" }, { status: 400 });
    }

    // Campos primeiro, depois a mudança de estado: "ganhar com o valor corrigido"
    // é um gesto só na tela e precisa gravar o valor novo no ganho.
    const campos = {
      ...(d.titulo !== undefined ? { titulo: d.titulo } : {}),
      ...(d.valorCents !== undefined ? { valorCents: d.valorCents } : {}),
      ...(d.recorrencia !== undefined ? { recorrencia: d.recorrencia } : {}),
      ...(d.responsavelId !== undefined ? { responsavelId: d.responsavelId } : {}),
      ...(d.origem !== undefined ? { origem: d.origem || null } : {}),
      ...(d.previsaoFechamento !== undefined
        ? {
            previsaoFechamento: d.previsaoFechamento && !Number.isNaN(new Date(d.previsaoFechamento).getTime())
              ? new Date(d.previsaoFechamento)
              : null,
          }
        : {}),
      ...(d.pagamento !== undefined
        ? (() => {
            const p = d.pagamento;
            // Plano de parcelas só faz sentido no Recorrente; nas outras formas
            // fica só a forma (e, a prazo, o 1º vencimento como data combinada).
            const recorrente = p?.forma === "FIADO";
            return {
              pagForma: p?.forma ?? null,
              pagEntradaCents: recorrente ? p?.entradaCents ?? 0 : null,
              pagNumParcelas: recorrente ? p?.numParcelas ?? 1 : null,
              pagPeriodicidade: recorrente ? p?.periodicidade ?? "SEMANAL" : null,
              pagPrimeiroVencimento: p?.primeiroVencimento ? new Date(`${p.primeiroVencimento}T12:00:00Z`) : null,
            };
          })()
        : {}),
    };
    if (Object.keys(campos).length > 0) {
      await prisma.negociacao.update({ where: { id: n.id }, data: campos });
      // Com itens o valor é derivado deles; sem, o mensal acompanha o valor.
      await recalcularValores(n.id);
    }

    switch (d.acao) {
      case "mover":
        if (!d.stageId) return NextResponse.json({ error: "informe a etapa" }, { status: 400 });
        await moverNegociacao(n, d.stageId, user);
        break;
      case "ganhar":
        await ganharNegociacao(n, user);
        break;
      case "perder":
        await perderNegociacao(n, user.tenantId, { motivoPerdaId: d.motivoPerdaId ?? null, detalhe: d.detalhe ?? null }, user);
        break;
      case "reabrir":
        await reabrirNegociacao(n, user, d.stageId);
        break;
    }
  } catch (e) {
    if (e instanceof ErroDeNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  return NextResponse.json({ ok: true });
}

/** Apagar leva o histórico junto; é da gestão. O dia a dia é ganhar/perder. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão apaga negociações" }, { status: 403 });

  const n = await daEmpresa(params.id, user.tenantId);
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });

  // Os arquivos ficam no R2: as linhas somem em cascata, os objetos não.
  const anexos = await prisma.negociacaoAnexo.findMany({ where: { negociacaoId: n.id }, select: { mediaKey: true } });
  await prisma.negociacao.delete({ where: { id: n.id } });
  await Promise.all(anexos.map((a) => deleteMedia(a.mediaKey).catch(() => {})));
  return NextResponse.json({ ok: true });
}
