import { createHash, randomUUID } from "node:crypto";
import type { CanalMarcacao, Marcacao, Prisma } from "@prisma-ponto/client";
import { cadeiaDeHashes, hashMarcacaoRep, type MarcacaoRep } from "@dilon-zap/ponto-core/src/rep";
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
      const [empresa, colaborador] = await Promise.all([
        tx.empresa.findUniqueOrThrow({ where: { id: dados.empresaId }, select: { timezone: true } }),
        tx.colaborador.findUniqueOrThrow({ where: { id: dados.colaboradorId }, select: { cpf: true } }),
      ]);
      const hashRepAnterior = await ultimoHashRep(tx, dados.empresaId, empresa.timezone);

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

      // A gravação usa a hora do servidor de agora (campo 5 do tipo "7");
      // a marcação, a do aparelho quando foi feita sem internet (campo 3).
      const gravadaEm = new Date();
      const hashRep = hashMarcacaoRep(
        {
          nsr,
          marcadaEm: instante,
          gravadaEm,
          cpf: colaborador.cpf,
          coletor: coletorDoCanal(dados.canal),
          offline: dados.offline ?? false,
        },
        empresa.timezone,
        hashRepAnterior,
      );

      const criada = await tx.marcacao.create({
        data: {
          ...base,
          id,
          criadoEm: gravadaEm,
          hashRep,
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

/**
 * Confere a integridade do registro da empresa:
 *   1. NSR de 1 até o último, sem buraco nem repetição, somando marcações e
 *      operações do REP (é uma sequência só);
 *   2. a cadeia interna das marcações (hash e hashAnterior);
 *   3. o hash oficial do AFD: o gravado tem que bater com o recalculado.
 * Devolve o primeiro NSR com problema, ou null.
 */
export async function verificarCadeia(empresaId: string): Promise<{ total: number; quebraNoNsr: number | null }> {
  const [empresa, marcacoes, registros] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: { timezone: true } }),
    prisma.marcacao.findMany({ where: { empresaId }, orderBy: { nsr: "asc" } }),
    prisma.registroRep.findMany({ where: { empresaId }, select: { nsr: true } }),
  ]);

  const nsrs = [...marcacoes.map((m) => m.nsr), ...registros.map((r) => r.nsr)].sort((a, b) => a - b);
  for (let i = 0; i < nsrs.length; i++) {
    if (nsrs[i] !== i + 1) return { total: marcacoes.length, quebraNoNsr: nsrs[i] };
  }

  let anterior = HASH_INICIAL;
  for (const m of marcacoes) {
    if (m.hashAnterior !== anterior || calcularHash(m, anterior) !== m.hash) {
      return { total: marcacoes.length, quebraNoNsr: m.nsr };
    }
    anterior = m.hash;
  }

  const oficial = cadeiaComHashes(await marcacoesParaRep(prisma, empresaId), empresa.timezone);
  const divergente = oficial.find((m) => !m.confere);
  if (divergente) return { total: marcacoes.length, quebraNoNsr: divergente.rep.nsr };

  return { total: marcacoes.length, quebraNoNsr: null };
}

// ── REP-P: hash oficial e operações do registro ─────────────────────────────

/** Identificador do coletor no AFD: "01" aplicativo mobile, "02" navegador. */
export function coletorDoCanal(canal: CanalMarcacao): MarcacaoRep["coletor"] {
  return canal === "APP" ? "01" : "02";
}

type ClienteDb = Prisma.TransactionClient | typeof prisma;

/**
 * Hash oficial da última marcação da empresa (base da próxima). Marcação
 * gravada antes do REP-P não tem `hashRep`: aí a cadeia é recalculada desde
 * o início pela fórmula do leiaute, que só usa dados que não mudam. Isso
 * acontece uma vez só, na primeira marcação depois da atualização.
 */
async function ultimoHashRep(tx: ClienteDb, empresaId: string, fuso: string): Promise<string | null> {
  const ultima = await tx.marcacao.findFirst({ where: { empresaId }, orderBy: { nsr: "desc" }, select: { hashRep: true } });
  if (!ultima) return null;
  if (ultima.hashRep) return ultima.hashRep;
  const todas = await marcacoesParaRep(tx, empresaId);
  return cadeiaComHashes(todas, fuso).at(-1)?.hash ?? null;
}

/** Marcações da empresa já no formato do REP, em ordem de NSR. */
export async function marcacoesParaRep(tx: ClienteDb, empresaId: string) {
  const linhas = await tx.marcacao.findMany({
    where: { empresaId },
    orderBy: { nsr: "asc" },
    select: { id: true, nsr: true, instante: true, criadoEm: true, canal: true, offline: true, hashRep: true, colaborador: { select: { cpf: true } } },
  });
  return linhas.map((m) => ({
    id: m.id,
    hashGravado: m.hashRep,
    rep: {
      nsr: m.nsr,
      marcadaEm: m.instante,
      gravadaEm: m.criadoEm,
      cpf: m.colaborador.cpf,
      coletor: coletorDoCanal(m.canal),
      offline: m.offline,
    } satisfies MarcacaoRep,
  }));
}

/**
 * Cadeia oficial completa. Onde a marcação tem hash gravado, ele tem que ser
 * igual ao recalculado; se não for, alguém mexeu no banco por fora.
 */
export function cadeiaComHashes(lista: Awaited<ReturnType<typeof marcacoesParaRep>>, fuso: string) {
  const hashes = cadeiaDeHashes(lista.map((m) => m.rep), fuso);
  return lista.map((m, i) => ({ ...m, hash: hashes[i], confere: m.hashGravado == null || m.hashGravado === hashes[i] }));
}

export type DadosRegistroRep =
  | { tipo: 2; cpfResponsavel: string; documento: string; cnoOuCaepf: string | null; razaoSocial: string; localPrestacao: string }
  | { tipo: 5; operacao: "I" | "A" | "E"; cpf: string; nome: string; cpfResponsavel: string }
  | { tipo: 6; evento: "02" | "07" | "08" };

/**
 * Grava uma operação do REP (tipos 2, 5 e 6) na mesma sequência de NSR das
 * marcações. Use dentro da transação da operação que a originou, para não
 * existir colaborador sem o registro correspondente.
 */
export async function registrarOperacaoRep(tx: ClienteDb, empresaId: string, dados: DadosRegistroRep) {
  const linhas = await tx.$queryRaw<Array<{ nsrAtual: number }>>`
    UPDATE "Empresa" SET "nsrAtual" = "nsrAtual" + 1 WHERE "id" = ${empresaId} RETURNING "nsrAtual"`;
  if (linhas.length === 0) throw new Error("Empresa não encontrada");
  const { tipo, ...resto } = dados;
  return tx.registroRep.create({ data: { empresaId, nsr: linhas[0].nsrAtual, tipo, dados: resto } });
}

/** Identificação atual da empresa no formato do registro tipo 2. */
export function identificacaoEmpresaRep(
  e: { cnpj: string; cnoOuCaepf: string | null; razaoSocial: string; endereco: string | null },
  cpfResponsavel: string,
): DadosRegistroRep {
  return {
    tipo: 2,
    cpfResponsavel,
    documento: e.cnpj,
    cnoOuCaepf: e.cnoOuCaepf,
    razaoSocial: e.razaoSocial,
    localPrestacao: e.endereco ?? "",
  };
}

/**
 * Garante que a empresa já está identificada no REP (tipo 2) e que todo
 * colaborador ativo tem a inclusão registrada (tipo 5 "I"). Serve para as
 * contas criadas antes do REP-P: roda quando o administrador informa o CPF.
 * Idempotente.
 */
export async function inicializarRep(empresaId: string, cpfResponsavel: string) {
  return prisma.$transaction(async (tx) => {
    const e = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const jaTem = await tx.registroRep.findFirst({ where: { empresaId, tipo: 2 } });
    if (!jaTem) await registrarOperacaoRep(tx, empresaId, identificacaoEmpresaRep(e, cpfResponsavel));

    const registrados = new Set(
      (await tx.registroRep.findMany({ where: { empresaId, tipo: 5 }, select: { dados: true } })).map(
        (r) => (r.dados as { cpf?: string }).cpf,
      ),
    );
    const ativos = await tx.colaborador.findMany({ where: { empresaId, ativo: true }, orderBy: { criadoEm: "asc" } });
    for (const c of ativos) {
      if (registrados.has(c.cpf)) continue;
      await registrarOperacaoRep(tx, empresaId, { tipo: 5, operacao: "I", cpf: c.cpf, nome: c.nome, cpfResponsavel });
    }
  });
}
