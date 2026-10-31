import { createHash } from "node:crypto";
import { prisma, Prisma } from "@dilon-zap/db";
import { carregarAlvo } from "./alvo";
import { ErroSdrCore } from "./erros";
import { enfileirar } from "./fila";
import { LIMITES } from "./limites";
import type { ContextoDeProcessamento } from "./importacao";
import { qualificar } from "./qualificacao";
import { bloqueiosDaEmpresa, carregarListas } from "./supressao";

/**
 * Associação de empresas a uma campanha e qualificação pelo ICP dela. Roda na
 * fila, como a importação. Não cria Contact, não consulta o WhatsApp e não
 * contata ninguém: só lê empresas e grava o prospecto com a pontuação.
 */

export type PayloadDeQualificacao = { campanhaId: string; empresaIds?: string[]; tudo?: boolean };

export async function associarEmpresas(tenantId: string, campanhaId: string, empresaIds: string[]) {
  const ids = [...new Set(empresaIds)];
  if (ids.length === 0) throw new ErroSdrCore("escolha ao menos uma empresa", 400);
  if (ids.length > LIMITES.empresasPorAssociacao) throw new ErroSdrCore(`escolha no máximo ${LIMITES.empresasPorAssociacao} empresas por vez`, 400);
  await carregarAlvo(tenantId, campanhaId);
  // Empresa de outra organização é recusada, não ignorada em silêncio.
  const encontradas = await prisma.sdrEmpresa.count({ where: { tenantId, id: { in: ids } } });
  if (encontradas !== ids.length) throw new ErroSdrCore("alguma empresa escolhida não existe nesta organização", 400);

  const resumo = createHash("sha256").update([...ids].sort().join(",")).digest("hex").slice(0, 24);
  const { trabalho, criado } = await enfileirar(tenantId, "QUALIFICAR", `qualificar:${campanhaId}:${resumo}`, { campanhaId, empresaIds: ids });
  return { trabalhoId: trabalho.id, jaProcessadoOuNaFila: !criado, empresas: ids.length };
}

/** Roda a qualificação de novo em todos os prospectos da campanha, por exemplo depois de mudar o ICP. */
export async function requalificarCampanha(tenantId: string, campanhaId: string) {
  await carregarAlvo(tenantId, campanhaId);
  const prefixo = `qualificar:${campanhaId}:todas:`;
  const ativo = await prisma.sdrTrabalho.findFirst({
    where: { tenantId, tipo: "QUALIFICAR", chave: { startsWith: prefixo }, status: { in: ["PENDENTE", "EM_PROCESSAMENTO"] } },
    select: { id: true },
  });
  if (ativo) return { trabalhoId: ativo.id, jaNaFila: true };
  const numero = (await prisma.sdrTrabalho.count({ where: { tenantId, tipo: "QUALIFICAR", chave: { startsWith: prefixo } } })) + 1;
  const { trabalho } = await enfileirar(tenantId, "QUALIFICAR", `${prefixo}${numero}`, { campanhaId, tudo: true });
  return { trabalhoId: trabalho.id, jaNaFila: false };
}

const lerPayload = (bruto: unknown): PayloadDeQualificacao => {
  const p = bruto as Partial<PayloadDeQualificacao> | null;
  if (!p || typeof p.campanhaId !== "string") throw new ErroSdrCore("trabalho de qualificação sem campanha", 400);
  return { campanhaId: p.campanhaId, empresaIds: Array.isArray(p.empresaIds) ? p.empresaIds.filter((i) => typeof i === "string") : undefined, tudo: p.tudo === true };
};

export async function processarQualificacao(tenantId: string, payloadBruto: unknown, ctx: ContextoDeProcessamento) {
  const payload = lerPayload(payloadBruto);
  const alvo = await carregarAlvo(tenantId, payload.campanhaId);
  const tamanho = ctx.lote ?? LIMITES.loteDeLinhas;
  const contagem = { qualificadas: 0, bloqueadas: 0 };

  const qualificarLote = async (empresaIds: string[]) => {
    const [empresas, listas] = await Promise.all([
      prisma.sdrEmpresa.findMany({ where: { tenantId, id: { in: empresaIds } } }),
      carregarListas(tenantId),
    ]);
    for (const empresa of empresas) {
      if (bloqueiosDaEmpresa(empresa, listas).length > 0) {
        contagem.bloqueadas++;
        continue;
      }
      const q = qualificar(empresa, alvo.perfil);
      const dados = {
        icpId: alvo.icpId,
        status: q.status,
        pontuacao: q.pontuacao,
        cobertura: q.cobertura,
        criterios: q.criterios as unknown as Prisma.InputJsonValue,
        qualificadoEm: new Date(),
      };
      await prisma.sdrProspecto.upsert({
        where: { tenantId_empresaId_campanhaId: { tenantId, empresaId: empresa.id, campanhaId: alvo.campanhaId } },
        create: { ...dados, tenantId, empresaId: empresa.id, campanhaId: alvo.campanhaId },
        update: dados,
      });
      contagem.qualificadas++;
    }
    if (!(await ctx.renovar())) throw new ErroSdrCore("a reserva do trabalho foi perdida", 409);
  };

  if (payload.tudo) {
    // Percorre os prospectos da campanha por cursor, em ordem de id.
    let cursor: string | undefined;
    for (;;) {
      const pagina = await prisma.sdrProspecto.findMany({
        where: { tenantId, campanhaId: alvo.campanhaId },
        orderBy: { id: "asc" },
        take: tamanho,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, empresaId: true },
      });
      if (pagina.length === 0) break;
      await qualificarLote(pagina.map((p) => p.empresaId));
      cursor = pagina[pagina.length - 1].id;
    }
  } else {
    const ids = payload.empresaIds ?? [];
    for (let i = 0; i < ids.length; i += tamanho) await qualificarLote(ids.slice(i, i + tamanho));
  }
  return { concluido: true, processadas: contagem.qualificadas + contagem.bloqueadas, ...contagem };
}
