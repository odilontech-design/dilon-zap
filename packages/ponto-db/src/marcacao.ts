import { createHash, randomUUID } from "node:crypto";
import type { CanalMarcacao, Marcacao, Prisma } from "@prisma-ponto/client";
import { prisma } from "./cliente";

/**
 * Gravação de marcação de ponto: o ÚNICO caminho para inserir em "Marcacao".
 *
 * - NSR sequencial por empresa: `UPDATE ... RETURNING` trava a linha da
 *   empresa até o fim da transação, então duas batidas simultâneas recebem
 *   números seguidos, sem repetir nem pular.
 * - Cadeia de hash: cada marcação guarda o hash da anterior da mesma empresa.
 *   Apagar ou alterar uma marcação no banco (o gatilho já impede, mas um
 *   restore parcial não) quebra a cadeia, e `verificarCadeia` aponta onde.
 * - Idempotência: o aparelho que reenviar a mesma batida (internet caiu
 *   depois do envio) recebe a marcação original, não uma segunda.
 * - A hora é a do SERVIDOR. A do aparelho só é guardada à parte, para a
 *   marcação feita sem internet.
 */

export const HASH_INICIAL = "0".repeat(64);

/**
 * Coordenada com 7 casas (≈ 1 cm). O número que o navegador manda tem até 17
 * dígitos e não volta idêntico do Postgres; arredondar ANTES de gravar e de
 * calcular o hash faz o valor guardado e o do hash serem o mesmo texto.
 */
export function coordenada(v: number | null | undefined): number | null {
  return v == null ? null : Math.round(v * 1e7) / 1e7;
}

export interface NovaMarcacao {
  empresaId: string;
  colaboradorId: string;
  canal: CanalMarcacao;
  idempotencia: string;
  latitude?: number | null;
  longitude?: number | null;
  precisaoM?: number | null;
  instanteDispositivo?: Date | null;
  offline?: boolean;
  ip?: string | null;
  userAgent?: string | null;
  revisar?: string | null;
  /** Foto já enviada ao R2. */
  fotoChave?: string | null;
  /** Foto a guardar no próprio banco (sem R2). */
  fotoBytes?: { mime: string; bytes: Buffer } | null;
  /** Só para seed e testes. Em produção a hora é sempre a do servidor. */
  instanteForcado?: Date;
}

export function calcularHash(
  m: Pick<Marcacao, "nsr" | "empresaId" | "colaboradorId" | "instante" | "canal" | "latitude" | "longitude" | "fotoChave">,
  hashAnterior: string,
): string {
  const conteudo = [
    hashAnterior,
    m.nsr,
    m.empresaId,
    m.colaboradorId,
    m.instante.toISOString(),
    m.canal,
    m.latitude == null ? "" : m.latitude.toFixed(7),
    m.longitude == null ? "" : m.longitude.toFixed(7),
    m.fotoChave ?? "",
  ].join("|");
  return createHash("sha256").update(conteudo).digest("hex");
}

export async function registrarMarcacao(dados: NovaMarcacao): Promise<{ marcacao: Marcacao; repetida: boolean }> {
  const existente = await prisma.marcacao.findUnique({ where: { idempotencia: dados.idempotencia } });
  if (existente) return { marcacao: existente, repetida: true };

  try {
    const marcacao = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const linhas = await tx.$queryRaw<Array<{ nsrAtual: number }>>`
        UPDATE "Empresa" SET "nsrAtual" = "nsrAtual" + 1 WHERE "id" = ${dados.empresaId} RETURNING "nsrAtual"`;
      if (linhas.length === 0) throw new Error("Empresa não encontrada");
      const nsr = linhas[0].nsrAtual;

      const anterior = await tx.marcacao.findFirst({
        where: { empresaId: dados.empresaId },
        orderBy: { nsr: "desc" },
        select: { hash: true },
      });
      const hashAnterior = anterior?.hash ?? HASH_INICIAL;

      const id = randomUUID();
      const instante = dados.instanteForcado ?? new Date();
      const fotoChave = dados.fotoBytes ? `db:${id}` : (dados.fotoChave ?? null);
      const base = {
        nsr,
        empresaId: dados.empresaId,
        colaboradorId: dados.colaboradorId,
        instante,
        canal: dados.canal,
        latitude: coordenada(dados.latitude),
        longitude: coordenada(dados.longitude),
        fotoChave,
      };

      const criada = await tx.marcacao.create({
        data: {
          ...base,
          id,
          precisaoM: dados.precisaoM ?? null,
          instanteDispositivo: dados.instanteDispositivo ?? null,
          offline: dados.offline ?? false,
          ip: dados.ip ?? null,
          userAgent: dados.userAgent?.slice(0, 300) ?? null,
          revisar: dados.revisar ?? null,
          idempotencia: dados.idempotencia,
          hashAnterior,
          hash: calcularHash(base, hashAnterior),
        },
      });

      if (dados.fotoBytes) {
        await tx.marcacaoFoto.create({
          data: { marcacaoId: id, mime: dados.fotoBytes.mime, bytes: dados.fotoBytes.bytes },
        });
      }
      return criada;
    });
    return { marcacao, repetida: false };
  } catch (err) {
    // Duas requisições com a mesma chave ao mesmo tempo: a segunda perde a
    // corrida no índice único e devolve a da primeira.
    if ((err as { code?: string }).code === "P2002") {
      const vencedora = await prisma.marcacao.findUnique({ where: { idempotencia: dados.idempotencia } });
      if (vencedora) return { marcacao: vencedora, repetida: true };
    }
    throw err;
  }
}

/** Confere a cadeia de hash da empresa. Devolve o primeiro NSR com problema, ou null. */
export async function verificarCadeia(empresaId: string): Promise<{ total: number; quebraNoNsr: number | null }> {
  const marcacoes = await prisma.marcacao.findMany({ where: { empresaId }, orderBy: { nsr: "asc" } });
  let anterior = HASH_INICIAL;
  let esperado = 1;
  for (const m of marcacoes) {
    if (m.nsr !== esperado || m.hashAnterior !== anterior || calcularHash(m, anterior) !== m.hash) {
      return { total: marcacoes.length, quebraNoNsr: m.nsr };
    }
    anterior = m.hash;
    esperado++;
  }
  return { total: marcacoes.length, quebraNoNsr: null };
}
