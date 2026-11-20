import type Anthropic from "@anthropic-ai/sdk";

/**
 * Regras puras do Vendedor IA: quando responder, quando parar, e como a
 * conversa do WhatsApp vira o histórico que vai para a API. Teste em
 * regras.test-manual.ts.
 */

export type MensagemDaConversa = {
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  mediaType: string | null;
  createdAt: Date;
  senderUserId: string | null;
  deCelular: boolean;
  isDeleted: boolean;
};

const ROTULO_MIDIA: Record<string, string> = {
  IMAGE: "[foto]",
  VIDEO: "[vídeo]",
  AUDIO: "[áudio]",
  DOCUMENT: "[documento]",
  STICKER: "[figurinha]",
};

/** O texto de uma mensagem como a IA lê: mídia vira um marcador, a legenda vem junto. */
function textoDaMensagem(m: MensagemDaConversa): string {
  const marcador = m.mediaType ? ROTULO_MIDIA[m.mediaType] ?? "[anexo]" : "";
  return [marcador, m.body.trim()].filter(Boolean).join(" ");
}

/**
 * A conversa (em ordem cronológica) → mensagens da API. O cliente é `user`;
 * a loja (IA, robô ou pessoa) é `assistant`. Mensagens seguidas do mesmo lado
 * viram uma só (o cliente manda três "oi" em sequência). A API exige começar
 * pelo cliente, e só faz sentido chamar se a última palavra é dele: senão
 * devolve null.
 */
export function montarHistorico(mensagens: MensagemDaConversa[]): Anthropic.Beta.BetaMessageParam[] | null {
  const blocos: { role: "user" | "assistant"; partes: string[] }[] = [];
  for (const m of mensagens) {
    if (m.isDeleted) continue;
    const texto = textoDaMensagem(m);
    if (!texto) continue;
    const role = m.direction === "INBOUND" ? "user" : "assistant";
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.role === role) ultimo.partes.push(texto);
    else blocos.push({ role, partes: [texto] });
  }
  while (blocos.length && blocos[0].role !== "user") blocos.shift();
  if (!blocos.length || blocos[blocos.length - 1].role !== "user") return null;
  return blocos.map((b) => ({ role: b.role, content: b.partes.join("\n") }));
}

/** A equipe falou: mensagem da loja escrita por uma pessoa (pelo Inbox ou pelo celular), não pelo robô nem pela IA. */
export function ehDaEquipe(m: Pick<MensagemDaConversa, "direction" | "senderUserId" | "deCelular">): boolean {
  return m.direction === "OUTBOUND" && (m.senderUserId !== null || m.deCelular);
}

export type EstadoDaConversa = {
  /** Conversa com a IA (null = a IA ainda não atendeu esta conversa). */
  conversa: { status: "ATIVA" | "TRANSFERIDA"; respondidoAte: Date | null; turnos: number; iniciadaEm: Date } | null;
  /** As mensagens recentes, em ordem cronológica. */
  mensagens: MensagemDaConversa[];
  /** Quando a IA foi ligada na loja. */
  ativadoEm: Date;
  /** Conversa já está com uma pessoa (atribuída). */
  atribuida: boolean;
  /** A loja passou de algum limite do mês (só barra conversas NOVAS). */
  limiteAtingido: boolean;
};

export type Decisao =
  | { acao: "responder" }
  | { acao: "esperar" }
  | { acao: "ignorar"; motivo: string }
  | { acao: "transferir"; motivo: string };

export const ESPERA_MS = 6_000;
export const VELHA_MS = 15 * 60_000;
export const MAX_TURNOS = 20;

/**
 * O que fazer com uma conversa agora.
 *
 *  - A IA só fala por último quando o cliente falou por último.
 *  - Espera alguns segundos de silêncio: quem escreve no WhatsApp manda em
 *    pedaços ("oi" / "ainda tem o polo?" / "aceita troca?"), e a IA responde
 *    tudo de uma vez em vez de três vezes.
 *  - Pessoa da equipe falou depois que a IA começou: a conversa é dela, a IA sai.
 *  - Conversa que já era de alguém (atribuída, ou com a equipe falando antes da
 *    IA chegar) a IA nem assume.
 *  - Mensagem velha (o processo ficou fora do ar) não é respondida: "ainda
 *    tem?" respondido uma hora depois por um robô soa pior que a equipe
 *    respondendo.
 */
export function decidir(e: EstadoDaConversa, agora: Date): Decisao {
  const ultima = e.mensagens[e.mensagens.length - 1];
  if (!ultima) return { acao: "ignorar", motivo: "sem mensagens" };

  if (e.conversa?.status === "TRANSFERIDA") return { acao: "ignorar", motivo: "já transferida" };

  const inicio = e.conversa?.iniciadaEm ?? e.ativadoEm;
  if (e.conversa && e.mensagens.some((m) => m.createdAt > inicio && ehDaEquipe(m))) return { acao: "transferir", motivo: "equipe respondeu" };

  if (ultima.direction !== "INBOUND") return { acao: "ignorar", motivo: "a última mensagem é da loja" };
  if (ultima.createdAt <= e.ativadoEm) return { acao: "ignorar", motivo: "mensagem de antes de ligar a IA" };
  if (e.conversa?.respondidoAte && ultima.createdAt <= e.conversa.respondidoAte) return { acao: "ignorar", motivo: "já respondida" };

  const idade = agora.getTime() - ultima.createdAt.getTime();
  if (idade > VELHA_MS) return { acao: "ignorar", motivo: "mensagem velha" };
  if (idade < ESPERA_MS) return { acao: "esperar" };

  if (!e.conversa) {
    if (e.atribuida) return { acao: "ignorar", motivo: "conversa já é de alguém" };
    if (e.mensagens.some(ehDaEquipe)) return { acao: "ignorar", motivo: "equipe já atendia" };
    if (e.limiteAtingido) return { acao: "ignorar", motivo: "limite do mês" };
  }
  if (e.conversa && e.conversa.turnos >= MAX_TURNOS) return { acao: "transferir", motivo: "limite de respostas da IA na conversa" };
  return { acao: "responder" };
}

/** O WhatsApp marca negrito com um asterisco; o modelo às vezes escreve no formato Markdown. */
export function paraWhatsApp(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "quinta-feira, 12/11/2026, 15:30": o relógio da loja, para a IA saber se é hora de visita. */
export function agoraNaLoja(agora: Date, timezone: string): string {
  return agora.toLocaleString("pt-BR", { timeZone: timezone, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
