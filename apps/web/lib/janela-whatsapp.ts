import { prisma, Prisma } from "@dilon-zap/db";
import { DIAS_PERMITIDOS, type LinhaDaJanela } from "./janela-whatsapp-regras";

export * from "./janela-whatsapp-regras";

type Linha = {
  tenantId: string; nome: string; slug: string;
  enviadas: bigint; dentro: bigint; reabertura: bigint; sem_previa: bigint;
  pico_hora: bigint; p95_hora: number; pico_fora_hora: bigint; p95_fora_hora: number;
};

export async function medirJanela(dias: number): Promise<LinhaDaJanela[]> {
  const d = DIAS_PERMITIDOS.includes(dias as (typeof DIAS_PERMITIDOS)[number]) ? dias : 30;
  const linhas = await prisma.$queryRaw<Linha[]>(Prisma.sql`
    with env as (
      select c."tenantId" tid, date_trunc('hour', m."createdAt") h,
        case when x.ui is null then 'sem'
             when m."createdAt" - x.ui <= interval '24 hours' then 'dentro'
             else 'reab' end cls
      from "Message" m
      join "Conversation" c on c.id = m."conversationId"
      cross join lateral (
        select max(i."createdAt") ui from "Message" i
        where i."conversationId" = m."conversationId" and i.direction = 'INBOUND' and i."createdAt" < m."createdAt"
      ) x
      where m.direction = 'OUTBOUND' and m."createdAt" > now() - make_interval(days => ${d}::int)
    ),
    hora as (select tid, h, count(*) n, count(*) filter (where cls <> 'dentro') nfora from env group by 1, 2),
    por_hora as (
      select tid, max(n) pico, percentile_cont(0.95) within group (order by n) p95,
             max(nfora) pico_fora, percentile_cont(0.95) within group (order by nfora) p95_fora
      from hora group by tid
    ),
    tot as (
      select tid, count(*) enviadas, count(*) filter (where cls = 'dentro') dentro,
             count(*) filter (where cls = 'reab') reabertura, count(*) filter (where cls = 'sem') sem_previa
      from env group by tid
    )
    select t.id as "tenantId", t.name as nome, t.slug, tot.enviadas, tot.dentro, tot.reabertura, tot.sem_previa,
           p.pico as pico_hora, p.p95 as p95_hora, p.pico_fora as pico_fora_hora, p.p95_fora as p95_fora_hora
    from tot join por_hora p on p.tid = tot.tid join "Tenant" t on t.id = tot.tid
    order by tot.enviadas desc`);

  const sessoes = await prisma.whatsAppSession.groupBy({ by: ["tenantId", "status"], _count: { _all: true } });
  const porTenant = new Map<string, { numeros: number; conectados: number }>();
  for (const s of sessoes) {
    const a = porTenant.get(s.tenantId) ?? { numeros: 0, conectados: 0 };
    a.numeros += s._count._all;
    if (s.status === "CONNECTED") a.conectados += s._count._all;
    porTenant.set(s.tenantId, a);
  }

  return linhas.map((l) => ({
    tenantId: l.tenantId,
    nome: l.nome,
    slug: l.slug,
    enviadas: Number(l.enviadas),
    dentro: Number(l.dentro),
    reabertura: Number(l.reabertura),
    semPrevia: Number(l.sem_previa),
    picoPorHora: Number(l.pico_hora),
    p95PorHora: Math.round(Number(l.p95_hora)),
    picoForaPorHora: Number(l.pico_fora_hora),
    p95ForaPorHora: Math.round(Number(l.p95_fora_hora)),
    numeros: porTenant.get(l.tenantId)?.numeros ?? 0,
    conectados: porTenant.get(l.tenantId)?.conectados ?? 0,
  }));
}
