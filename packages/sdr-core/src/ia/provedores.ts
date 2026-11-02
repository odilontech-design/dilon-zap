import { ErroSdrCore } from "../erros";
import type { NomeProvedor } from "./config";

/**
 * Os únicos lugares que falam com Anthropic e Google, e os únicos que leem as chaves
 * (ANTHROPIC_API_KEY e GEMINI_API_KEY, só no servidor). Sem SDK: é um POST com fetch, o que
 * mantém o pacote sem dependência nova e deixa os testes trocarem o fetch por um falso.
 */

export type PedidoAoProvedor = { modelo: string; sistema: string; usuario: string; maxTokensSaida: number; signal: AbortSignal };
export type RespostaDoProvedor = { texto: string; tokensEntrada: number; tokensSaida: number };
export type Provedor = { chamar(p: PedidoAoProvedor): Promise<RespostaDoProvedor> };

type Opcoes = { chave: () => string | undefined; fetchFn?: typeof fetch };

function exigirChave(nome: string, chave: () => string | undefined): string {
  const valor = chave()?.trim();
  if (!valor) throw new ErroSdrCore(`a chave do provedor ${nome} não está configurada no servidor`, 503);
  return valor;
}

/** Nunca devolve o corpo bruto do provedor nem a chave: só o status e um trecho curto. */
async function falhaHttp(nome: string, r: Response): Promise<never> {
  const corpo = (await r.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
  throw new ErroSdrCore(`${nome} respondeu ${r.status}${corpo ? `: ${corpo}` : ""}`, 502);
}

const inteiro = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

export function provedorAnthropic({ chave, fetchFn = fetch }: Opcoes): Provedor {
  return {
    async chamar(p) {
      const key = exigirChave("anthropic", chave);
      const r = await fetchFn("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: p.signal,
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: p.modelo, max_tokens: p.maxTokensSaida, system: p.sistema, messages: [{ role: "user", content: p.usuario }] }),
      });
      if (!r.ok) return falhaHttp("anthropic", r);
      const j = (await r.json()) as { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
      const texto = (j.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      return { texto, tokensEntrada: inteiro(j.usage?.input_tokens), tokensSaida: inteiro(j.usage?.output_tokens) };
    },
  };
}

export function provedorGemini({ chave, fetchFn = fetch }: Opcoes): Provedor {
  return {
    async chamar(p) {
      const key = exigirChave("gemini", chave);
      // A chave vai no cabeçalho, e não na URL, para não aparecer em log de acesso nem em mensagem de erro.
      const r = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.modelo)}:generateContent`, {
        method: "POST",
        signal: p.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: p.sistema }] },
          contents: [{ role: "user", parts: [{ text: p.usuario }] }],
          generationConfig: { maxOutputTokens: p.maxTokensSaida, responseMimeType: "application/json" },
        }),
      });
      if (!r.ok) return falhaHttp("gemini", r);
      const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      const texto = (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("");
      return { texto, tokensEntrada: inteiro(j.usageMetadata?.promptTokenCount), tokensSaida: inteiro(j.usageMetadata?.candidatesTokenCount) };
    },
  };
}

export type Provedores = Record<NomeProvedor, Provedor>;

/** As chaves são lidas a cada chamada, no momento do uso, e só aqui. */
export function provedoresPadrao(fetchFn?: typeof fetch): Provedores {
  return {
    anthropic: provedorAnthropic({ chave: () => process.env.ANTHROPIC_API_KEY, fetchFn }),
    gemini: provedorGemini({ chave: () => process.env.GEMINI_API_KEY, fetchFn }),
  };
}

/** Tira do texto de erro qualquer valor de chave que tenha escapado. */
export function semSegredos(texto: string): string {
  let limpo = texto;
  for (const segredo of [process.env.ANTHROPIC_API_KEY, process.env.GEMINI_API_KEY]) {
    if (segredo && segredo.length >= 8) limpo = limpo.split(segredo).join("[oculto]");
  }
  return limpo;
}
