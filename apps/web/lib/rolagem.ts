/**
 * Rola SÓ a caixa de mensagens, nunca a página.
 *
 * `scrollIntoView` rola todos os ancestrais roláveis até o elemento aparecer —
 * a página inteira junto. No computador não se nota; no celular a tela
 * "subia" ao abrir uma conversa e o cabeçalho sumia (Believe, 23/10). Mexer
 * direto no scrollTop do contêiner leva à mensagem sem tocar no resto.
 */
export function rolarParaOFim(caixa: HTMLElement | null, suave = false) {
  if (!caixa) return;
  caixa.scrollTo({ top: caixa.scrollHeight, behavior: suave ? "smooth" : "auto" });
}

/** Centraliza `alvo` dentro de `caixa` (resposta citada, resultado de busca). */
export function rolarAte(caixa: HTMLElement | null, alvo: HTMLElement | null, suave = true) {
  if (!caixa || !alvo) return;
  const c = caixa.getBoundingClientRect();
  const a = alvo.getBoundingClientRect();
  const topo = caixa.scrollTop + (a.top - c.top) - (c.height - a.height) / 2;
  caixa.scrollTo({ top: Math.max(0, topo), behavior: suave ? "smooth" : "auto" });
}
