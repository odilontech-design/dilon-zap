import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const FIRST_RESPONSE_SAMPLE_SIZE = 50; // últimas conversas usadas pra calcular a média — evita varrer o histórico inteiro a cada carregamento

// Duas semanas: pega o padrão semanal (a queda de sábado, a segunda cheia)
// duas vezes, que é o mínimo pra saber se é padrão ou foi só aquela semana.
// Mais que isso aperta demais os pontos numa tela de 3 polegadas.
const DIAS_NA_SERIE = 14;

type LinhaDoDia = { dia: Date; direction: "INBOUND" | "OUTBOUND"; total: bigint };

/**
 * Mensagens por dia, separadas entre recebidas e enviadas.
 *
 * Agregado no Postgres, e não trazendo as mensagens pra contar aqui: são duas
 * semanas de tráfego (na Believe, mais de mil linhas) numa rota que o painel
 * consulta em laço. O banco devolve no máximo 28 linhas.
 *
 * O `AT TIME ZONE` não é detalhe. A mensagem é gravada em UTC, e São Paulo
 * está três horas atrás: sem converter antes de cortar o dia, tudo que
 * chegasse depois das 21h entraria no dia seguinte — e o gráfico mostraria
 * movimento de madrugada que nunca existiu.
 */
async function mensagensPorDia(tenantId: string, timezone: string) {
  const linhas = await prisma.$queryRaw<LinhaDoDia[]>`
    SELECT
      date_trunc('day', m."createdAt" AT TIME ZONE ${timezone})::date AS dia,
      m.direction,
      count(*) AS total
    FROM "Message" m
    JOIN "WhatsAppSession" s ON s.id = m."sessionId"
    WHERE s."tenantId" = ${tenantId}
      AND m."createdAt" >= now() - (${DIAS_NA_SERIE} || ' days')::interval
    GROUP BY 1, 2
    ORDER BY 1
  `;

  // Dia sem mensagem não vem do banco, e precisa aparecer como zero: uma
  // linha que "pula" o feriado desenharia uma reta ligando os dois lados e
  // esconderia justamente o dia parado.
  //
  // Os dias são montados NO FUSO DA EMPRESA, igual ao que o SQL agrupou. Usar
  // toISOString() aqui pareceria funcionar e erraria toda noite: depois das
  // 21h em São Paulo já é o dia seguinte em UTC, então "hoje" da lista não
  // casaria com "hoje" do banco e o dia corrente sumiria do gráfico.
  const porDia = new Map<string, { recebidas: number; enviadas: number }>();
  const hojeNoFuso = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // en-CA já sai como YYYY-MM-DD

  // Âncora em meia-noite UTC só pra fazer aritmética de data sem que horário
  // de verão tire ou some uma hora e faça um dia se repetir ou sumir.
  const ancora = new Date(`${hojeNoFuso}T00:00:00Z`);
  for (let i = DIAS_NA_SERIE - 1; i >= 0; i--) {
    const d = new Date(ancora);
    d.setUTCDate(d.getUTCDate() - i);
    porDia.set(d.toISOString().slice(0, 10), { recebidas: 0, enviadas: 0 });
  }

  for (const linha of linhas) {
    const chave = new Date(linha.dia).toISOString().slice(0, 10);
    const alvo = porDia.get(chave);
    if (!alvo) continue; // fora da janela por arredondamento de fuso
    // count(*) volta como BigInt no Prisma; Number aguenta com folga.
    if (linha.direction === "INBOUND") alvo.recebidas = Number(linha.total);
    else alvo.enviadas = Number(linha.total);
  }

  return [...porDia.entries()].map(([dia, v]) => ({ dia, ...v }));
}

export async function GET() {
  const user = await requireUser();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { timezone: true },
  });

  const [statusCounts, messages24h, messages7d, sample, agents, session, serieDiaria] =
    await Promise.all([
    prisma.conversation.groupBy({
      by: ["status"],
      where: { tenantId: user.tenantId },
      _count: true,
    }),
    prisma.message.count({
      where: { session: { tenantId: user.tenantId }, createdAt: { gte: since24h } },
    }),
    prisma.message.count({
      where: { session: { tenantId: user.tenantId }, createdAt: { gte: since7d } },
    }),
    prisma.conversation.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { lastMessageAt: "desc" },
      take: FIRST_RESPONSE_SAMPLE_SIZE,
      include: { messages: { orderBy: { createdAt: "asc" }, select: { direction: true, createdAt: true } } },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        name: true,
        assignedConversations: { select: { status: true } },
      },
    }),
    prisma.whatsAppSession.findFirst({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      select: { status: true, phoneNumber: true },
    }),
    mensagensPorDia(user.tenantId, tenant.timezone),
  ]);

  const firstResponseMinutes: number[] = [];
  for (const conversation of sample) {
    const firstInbound = conversation.messages.find((m) => m.direction === "INBOUND");
    if (!firstInbound) continue;
    const firstReply = conversation.messages.find(
      (m) => m.direction === "OUTBOUND" && m.createdAt > firstInbound.createdAt
    );
    if (!firstReply) continue;
    firstResponseMinutes.push((firstReply.createdAt.getTime() - firstInbound.createdAt.getTime()) / 60_000);
  }
  const avgFirstResponseMinutes =
    firstResponseMinutes.length > 0
      ? firstResponseMinutes.reduce((a, b) => a + b, 0) / firstResponseMinutes.length
      : null;

  const statusMap = { OPEN: 0, PENDING: 0, RESOLVED: 0 };
  for (const row of statusCounts) statusMap[row.status] = row._count;

  const agentWorkload = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    active: agent.assignedConversations.filter((c) => c.status !== "RESOLVED").length,
    resolved: agent.assignedConversations.filter((c) => c.status === "RESOLVED").length,
  }));

  return NextResponse.json({
    statusCounts: statusMap,
    messages24h,
    messages7d,
    avgFirstResponseMinutes,
    firstResponseSampleSize: firstResponseMinutes.length,
    agentWorkload,
    session,
    serieDiaria,
  });
}
