import { prisma, Prisma } from "@dilon-zap/db";
import { LIMITES } from "./limites";

/**
 * Fila no Postgres, sem Redis.
 *
 * - Reivindicar usa FOR UPDATE SKIP LOCKED: dois workers nunca pegam o mesmo trabalho.
 * - A reserva (leaseAte) expira. Worker que morreu deixa o trabalho EM_PROCESSAMENTO
 *   com a reserva vencida, e o próximo ciclo o devolve à fila (contando a tentativa).
 * - Quem perdeu a reserva não consegue concluir nem falhar o trabalho: todo
 *   desfecho confere o dono.
 * - A chave por empresa torna o enfileiramento idempotente.
 *
 * Fuso: o Prisma grava DateTime como timestamp SEM fuso, em UTC. Comparar essas
 * colunas com now() (que usa o fuso do servidor) erra por horas se o Postgres
 * não estiver em UTC. Por isso todo SQL cru daqui usa AGORA, que é UTC, igual
 * ao que o Prisma grava e lê.
 */
const AGORA = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

export type TipoTrabalho = "IMPORTAR" | "QUALIFICAR";

export type Trabalho = {
  id: string;
  tenantId: string;
  tipo: TipoTrabalho;
  chave: string;
  payload: Record<string, unknown>;
  status: "PENDENTE" | "EM_PROCESSAMENTO" | "CONCLUIDO" | "FALHOU";
  tentativas: number;
  maxTentativas: number;
  bloqueadoPor: string | null;
  leaseAte: Date | null;
  erro: string | null;
};

export async function enfileirar(
  tenantId: string,
  tipo: TipoTrabalho,
  chave: string,
  payload: Record<string, unknown>,
  opcoes: { maxTentativas?: number } = {}
): Promise<{ trabalho: { id: string; status: string }; criado: boolean }> {
  try {
    const t = await prisma.sdrTrabalho.create({
      data: {
        tenantId,
        tipo,
        chave,
        payload: payload as Prisma.InputJsonValue,
        maxTentativas: opcoes.maxTentativas ?? LIMITES.tentativasDoTrabalho,
        proximaTentativaEm: new Date(),
      },
      select: { id: true, status: true },
    });
    return { trabalho: t, criado: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existente = await prisma.sdrTrabalho.findUniqueOrThrow({ where: { tenantId_chave: { tenantId, chave } }, select: { id: true, status: true } });
      return { trabalho: existente, criado: false };
    }
    throw e;
  }
}

/** Trabalhos esgotados na reserva: viram FALHOU e o chamador atualiza o que dependia deles. */
export async function falharEsgotados(): Promise<Pick<Trabalho, "id" | "tenantId" | "tipo" | "payload">[]> {
  return prisma.$queryRaw<Pick<Trabalho, "id" | "tenantId" | "tipo" | "payload">[]>(Prisma.sql`
    UPDATE "SdrTrabalho"
    SET status = 'FALHOU', erro = 'limite de tentativas atingido depois de interrupções', "concluidoEm" = ${AGORA},
        "bloqueadoPor" = NULL, "leaseAte" = NULL
    WHERE status = 'EM_PROCESSAMENTO' AND "leaseAte" < ${AGORA} AND tentativas >= "maxTentativas"
    RETURNING id, "tenantId", tipo, payload`);
}

/** Pega o próximo trabalho: pendente e na hora, ou interrompido com a reserva vencida. */
export async function reivindicar(workerId: string, reservaMs: number = LIMITES.reservaMs): Promise<Trabalho | null> {
  const linhas = await prisma.$queryRaw<Trabalho[]>(Prisma.sql`
    WITH proximo AS (
      SELECT id FROM "SdrTrabalho"
      WHERE tentativas < "maxTentativas"
        AND ( (status = 'PENDENTE' AND "proximaTentativaEm" <= ${AGORA})
           OR (status = 'EM_PROCESSAMENTO' AND "leaseAte" < ${AGORA}) )
      ORDER BY "proximaTentativaEm" ASC, "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "SdrTrabalho" t
    SET status = 'EM_PROCESSAMENTO',
        tentativas = t.tentativas + 1,
        "bloqueadoPor" = ${workerId},
        "leaseAte" = ${AGORA} + (${reservaMs}::int * interval '1 millisecond'),
        "iniciadoEm" = COALESCE(t."iniciadoEm", ${AGORA}),
        erro = NULL
    FROM proximo
    WHERE t.id = proximo.id
    RETURNING t.id, t."tenantId", t.tipo, t.chave, t.payload, t.status, t.tentativas, t."maxTentativas", t."bloqueadoPor", t."leaseAte", t.erro`);
  return linhas[0] ?? null;
}

/** Estende a reserva. Falso = o trabalho já não é deste worker. */
export async function renovarReserva(id: string, workerId: string, reservaMs: number = LIMITES.reservaMs): Promise<boolean> {
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE "SdrTrabalho" SET "leaseAte" = ${AGORA} + (${reservaMs}::int * interval '1 millisecond')
    WHERE id = ${id} AND "bloqueadoPor" = ${workerId} AND status = 'EM_PROCESSAMENTO'`);
  return n === 1;
}

export async function concluir(id: string, workerId: string): Promise<boolean> {
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE "SdrTrabalho" SET status = 'CONCLUIDO', "concluidoEm" = ${AGORA}, "bloqueadoPor" = NULL, "leaseAte" = NULL, erro = NULL
    WHERE id = ${id} AND "bloqueadoPor" = ${workerId} AND status = 'EM_PROCESSAMENTO'`);
  return n === 1;
}

/**
 * Registra a falha. Com tentativas sobrando, volta para a fila depois de uma
 * espera; sem elas, fica FALHOU. Devolve o estado final.
 */
export async function falhar(id: string, workerId: string, erro: string, esperaMs: number): Promise<"REAGENDADO" | "FALHOU" | "PERDIDO"> {
  const mensagem = erro.slice(0, 500);
  const linhas = await prisma.$queryRaw<{ status: string }[]>(Prisma.sql`
    UPDATE "SdrTrabalho"
    SET status = CASE WHEN tentativas >= "maxTentativas" THEN 'FALHOU'::"StatusTrabalhoSdr" ELSE 'PENDENTE'::"StatusTrabalhoSdr" END,
        erro = ${mensagem},
        "proximaTentativaEm" = ${AGORA} + (${esperaMs}::int * interval '1 millisecond'),
        "concluidoEm" = CASE WHEN tentativas >= "maxTentativas" THEN ${AGORA} ELSE NULL END,
        "bloqueadoPor" = NULL, "leaseAte" = NULL
    WHERE id = ${id} AND "bloqueadoPor" = ${workerId} AND status = 'EM_PROCESSAMENTO'
    RETURNING status`);
  if (!linhas[0]) return "PERDIDO";
  return linhas[0].status === "FALHOU" ? "FALHOU" : "REAGENDADO";
}

/** Devolve o trabalho à fila sem gastar tentativa: o worker só passou o limite da execução. */
export async function devolver(id: string, workerId: string): Promise<boolean> {
  const n = await prisma.$executeRaw(Prisma.sql`
    UPDATE "SdrTrabalho"
    SET status = 'PENDENTE', tentativas = GREATEST(tentativas - 1, 0), "proximaTentativaEm" = ${AGORA}, "bloqueadoPor" = NULL, "leaseAte" = NULL
    WHERE id = ${id} AND "bloqueadoPor" = ${workerId} AND status = 'EM_PROCESSAMENTO'`);
  return n === 1;
}
