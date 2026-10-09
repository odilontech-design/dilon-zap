import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { funilDaEmpresa, garantirMotivosDePerda } from "@/lib/funis";
import { criarNegociacao, ErroDeNegocio } from "@/lib/negociacoes";
import {
  calcularIndicadores,
  filtrarNegociacoes,
  type NegociacaoIn,
  type EventoIn,
} from "@/lib/funil-indicadores";

function dataOuNada(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * O quadro de UM funil: etapas, negociações e indicadores num pedido só.
 *
 * Quadro e indicadores saem do MESMO conjunto filtrado — se cada um filtrasse
 * por conta própria, a tela mostraria 40 cartões e o indicador contaria 37.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;

  const funil = await funilDaEmpresa(user.tenantId, q.get("funilId"));
  if (!funil) return NextResponse.json({ error: "funil não encontrado" }, { status: 404 });
  await garantirMotivosDePerda(user.tenantId);

  const [etapas, brutas, motivos, usuarios] = await Promise.all([
    prisma.stage.findMany({ where: { funilId: funil.id }, orderBy: { position: "asc" } }),
    prisma.negociacao.findMany({
      where: { tenantId: user.tenantId, funilId: funil.id },
      include: {
        contact: { select: { id: true, name: true, phoneNumber: true, waJid: true, avatarUrl: true } },
        responsavel: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.motivoDePerda.findMany({ where: { tenantId: user.tenantId }, select: { id: true, nome: true, ativo: true } }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const entrada: NegociacaoIn[] = brutas.map((n) => ({
    id: n.id,
    funilId: n.funilId,
    stageId: n.stageId,
    status: n.status,
    valorCents: n.valorCents,
    recorrencia: n.recorrencia,
    responsavelId: n.responsavelId,
    origem: n.origem,
    motivoPerdaId: n.motivoPerdaId,
    previsaoFechamento: n.previsaoFechamento,
    etapaDesde: n.etapaDesde,
    createdAt: n.createdAt,
    fechadaEm: n.fechadaEm,
  }));

  const responsavel = q.get("responsavelId") || undefined;
  const filtradas = filtrarNegociacoes(entrada, {
    funilId: funil.id,
    responsavelId: responsavel,
    origem: q.get("origem") || undefined,
    desde: dataOuNada(q.get("desde")),
    ate: dataOuNada(q.get("ate")),
  });
  const idsFiltrados = new Set(filtradas.map((n) => n.id));

  const eventosBrutos = await prisma.historicoDeEtapa.findMany({
    where: { negociacaoId: { in: [...idsFiltrados] } },
    select: { negociacaoId: true, tipo: true, paraStageId: true, em: true },
  });
  const eventos: EventoIn[] = eventosBrutos;

  const indicadores = calcularIndicadores({
    negociacoes: filtradas,
    eventos,
    etapas: etapas.map((e) => ({ id: e.id, nome: e.name, position: e.position, probabilidade: e.probabilidade })),
    agora: new Date(),
  });

  // Busca por texto é só do quadro (nome do cliente ou título). Não entra nos
  // indicadores: filtrar a taxa de conversão por "Maria" não responde nada.
  const busca = (q.get("busca") ?? "").trim().toLowerCase();
  const doQuadro = brutas.filter((n) => {
    if (!idsFiltrados.has(n.id)) return false;
    if (!busca) return true;
    return (
      n.titulo.toLowerCase().includes(busca) ||
      (n.contact.name ?? "").toLowerCase().includes(busca) ||
      (n.contact.phoneNumber ?? "").includes(busca)
    );
  });

  // Próxima tarefa pendente de cada negociação aberta do quadro: é o que o
  // cartão mostra, e o que separa "negócio andando" de "negócio esquecido".
  const idsAbertas = doQuadro.filter((n) => n.status === "ABERTA").map((n) => n.id);
  const pendentes = idsAbertas.length
    ? await prisma.tarefaNegociacao.findMany({
        where: { tenantId: user.tenantId, negociacaoId: { in: idsAbertas }, concluidaEm: null },
        orderBy: { venceEm: "asc" },
        select: { negociacaoId: true, titulo: true, tipo: true, venceEm: true },
      })
    : [];
  const proximaDe = new Map<string, { titulo: string; tipo: string; venceEm: Date }>();
  const agora = new Date();
  const atrasadasDe = new Map<string, number>();
  for (const t of pendentes) {
    if (!proximaDe.has(t.negociacaoId)) proximaDe.set(t.negociacaoId, t);
    if (t.venceEm < agora) atrasadasDe.set(t.negociacaoId, (atrasadasDe.get(t.negociacaoId) ?? 0) + 1);
  }

  // Sugestões de origem: o que a empresa já usou, pra não nascerem "insta" e "Instagram".
  const origens = [...new Set(brutas.map((n) => n.origem).filter((o): o is string => !!o))].sort();

  return NextResponse.json({
    funil: { id: funil.id, nome: funil.nome },
    etapas: etapas.map((e) => ({
      id: e.id,
      nome: e.name,
      cor: e.color,
      position: e.position,
      probabilidade: e.probabilidade,
    })),
    negociacoes: doQuadro.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      stageId: n.stageId,
      status: n.status,
      valorCents: n.valorCents,
      recorrencia: n.recorrencia,
      origem: n.origem,
      previsaoFechamento: n.previsaoFechamento,
      etapaDesde: n.etapaDesde,
      createdAt: n.createdAt,
      fechadaEm: n.fechadaEm,
      motivoPerdaId: n.motivoPerdaId,
      proximaTarefa: proximaDe.get(n.id) ?? null,
      tarefasAtrasadas: atrasadasDe.get(n.id) ?? 0,
      contato: {
        id: n.contact.id,
        nome: n.contact.name,
        telefone: n.contact.phoneNumber ?? (n.contact.waJid.endsWith("@s.whatsapp.net") ? n.contact.waJid.split("@")[0] : null),
        avatarUrl: n.contact.avatarUrl,
      },
      responsavel: n.responsavel,
    })),
    indicadores,
    origens,
    motivos,
    usuarios,
  });
}

const criarSchema = z.object({
  contactId: z.string().min(1),
  titulo: z.string().trim().min(1).max(120),
  valorCents: z.number().int().min(0).max(10_000_000_000).default(0),
  recorrencia: z.enum(["UNICA", "MENSAL"]).default("UNICA"),
  funilId: z.string().optional(),
  stageId: z.string().optional(),
  responsavelId: z.string().nullable().optional(),
  origem: z.string().trim().max(60).nullable().optional(),
  previsaoFechamento: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = criarSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const funil = await funilDaEmpresa(user.tenantId, d.funilId);
  if (!funil) return NextResponse.json({ error: "funil não encontrado" }, { status: 404 });

  const contato = await prisma.contact.findFirst({ where: { id: d.contactId, tenantId: user.tenantId }, select: { id: true } });
  if (!contato) return NextResponse.json({ error: "contato não encontrado" }, { status: 404 });

  if (d.responsavelId) {
    const resp = await prisma.user.findFirst({ where: { id: d.responsavelId, tenantId: user.tenantId }, select: { id: true } });
    if (!resp) return NextResponse.json({ error: "responsável inválido" }, { status: 400 });
  }

  // Sem etapa informada, entra na primeira do funil.
  let stageId = d.stageId;
  if (!stageId) {
    const primeira = await prisma.stage.findFirst({ where: { funilId: funil.id }, orderBy: { position: "asc" } });
    if (!primeira) return NextResponse.json({ error: "este funil ainda não tem etapas" }, { status: 409 });
    stageId = primeira.id;
  }

  const previsao = dataOuNada(d.previsaoFechamento ?? null) ?? null;

  try {
    const n = await criarNegociacao({
      tenantId: user.tenantId,
      quem: user,
      contactId: contato.id,
      funilId: funil.id,
      stageId,
      titulo: d.titulo,
      valorCents: d.valorCents,
      recorrencia: d.recorrencia,
      responsavelId: d.responsavelId ?? null,
      origem: d.origem || null,
      previsaoFechamento: previsao,
    });
    return NextResponse.json({ id: n.id });
  } catch (e) {
    if (e instanceof ErroDeNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
