import { prisma } from "@dilon-zap/db";
import type { ClienteIa } from "./executar";

/**
 * A saúde da conexão com a Anthropic. Só o worker do Vendedor IA tem a chave, então é ele quem confere: uma chamada
 * mínima (16 tokens) com o modelo mais barato e com cada modelo que as lojas ligadas usam, a cada 15 minutos e quando
 * o Super Admin pede. O resultado fica numa linha do banco (`VendedorIaSaude`) que a tela do Super Admin lê.
 * Custo: frações de centavo por conferência.
 */

export const MODELO_DO_TESTE = "claude-haiku-5-5";
export const INTERVALO_DA_CONFERENCIA_MS = 15 * 60_000;

export type ResultadoDoModelo = { modelo: string; ok: boolean; ms: number | null; erro: string | null };

/** A frase que o dono entende, sem vazar chave nem detalhe técnico. */
export function explicarErro(e: unknown): string {
  const status = typeof e === "object" && e !== null && "status" in e ? Number((e as { status?: unknown }).status) : NaN;
  const texto = (e instanceof Error ? e.message : String(e)).replace(/sk-[A-Za-z0-9_-]+/g, "[chave]").slice(0, 160);
  if (status === 401) return "A Anthropic recusou a chave (inválida ou revogada). Confira a ANTHROPIC_API_KEY do servidor.";
  if (status === 403) return "A chave não tem permissão para este modelo ou a conta está bloqueada na Anthropic.";
  if (status === 404) return "O modelo não existe ou a chave não tem acesso a ele.";
  if (status === 429) return "Limite de uso ou saldo da conta na Anthropic esgotado. Veja o painel da Anthropic.";
  if (status >= 500) return "A Anthropic está fora do ar ou instável agora.";
  if (/timeout|timed out|ECONN|ENOTFOUND|fetch failed|network/i.test(texto)) return "Não foi possível falar com a Anthropic (rede ou tempo esgotado).";
  return `Falha ao chamar a Anthropic: ${texto}`;
}

/** Precisa conferir agora? Nunca conferiu, passou do intervalo ou o Super Admin pediu. */
export async function precisaVerificar(agora: Date = new Date()): Promise<boolean> {
  const l = await prisma.vendedorIaSaude.findUnique({ where: { id: "global" } });
  if (!l?.verificadoEm) return true;
  if (l.testeSolicitadoEm && l.testeSolicitadoEm > l.verificadoEm) return true;
  return agora.getTime() - l.verificadoEm.getTime() >= INTERVALO_DA_CONFERENCIA_MS;
}

/** Confere a conexão e grava o resultado. Sem cliente (chave ausente) só registra isso, sem chamar nada. */
export async function verificarConexao(cliente: ClienteIa | null, agora: Date = new Date()): Promise<{ ok: boolean; resultados: ResultadoDoModelo[] }> {
  const resultados: ResultadoDoModelo[] = [];
  if (cliente) {
    const lojas = await prisma.vendedorIaConfig.findMany({ where: { ativo: true }, select: { modelo: true }, distinct: ["modelo"], take: 5 });
    const modelos = Array.from(new Set([MODELO_DO_TESTE, ...lojas.map((l) => l.modelo)]));
    for (const modelo of modelos) {
      const inicio = Date.now();
      try {
        await cliente.beta.messages.create({ model: modelo, max_tokens: 16, messages: [{ role: "user", content: "Responda apenas: ok" }] });
        resultados.push({ modelo, ok: true, ms: Date.now() - inicio, erro: null });
      } catch (e) {
        resultados.push({ modelo, ok: false, ms: null, erro: explicarErro(e) });
      }
    }
  }
  const ok = !!cliente && resultados.length > 0 && resultados.every((r) => r.ok);
  const dados = { chaveConfigurada: !!cliente, ok, resultados: resultados as unknown as object, verificadoEm: agora };
  await prisma.vendedorIaSaude.upsert({ where: { id: "global" }, create: { id: "global", ...dados }, update: dados });
  return { ok, resultados };
}
