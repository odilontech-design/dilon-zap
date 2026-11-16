/**
 * Regras puras do vendedor de SaaS do SDR: quando responder, esperar, ignorar ou passar para uma pessoa, e como a
 * conversa do WhatsApp vira o histórico que o modelo lê. Sem banco e sem rede, para testar com datas fixas.
 *
 * O vendedor NUNCA puxa assunto. A abertura sai de uma pessoa, por clique, pelo Inbox; a IA só entra depois que a
 * empresa respondeu, e sai assim que uma pessoa da equipe fala.
 */

export type MensagemDaConversa = {
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  mediaType: string | null;
  createdAt: Date;
  senderUserId: string | null;
  deCelular: boolean;
  isDeleted: boolean;
  referenciaExterna: string | null;
};

export const PREFIXO_DA_IA = "vendedor-saas:";

/** Mensagem que o próprio vendedor mandou. */
export const ehDaIa = (m: Pick<MensagemDaConversa, "direction" | "referenciaExterna">) => m.direction === "OUTBOUND" && !!m.referenciaExterna?.startsWith(PREFIXO_DA_IA);

/** Escrita por uma pessoa (pelo Inbox ou pelo celular): nem o robô de menu, nem a IA. */
export const ehDaEquipe = (m: Pick<MensagemDaConversa, "direction" | "senderUserId" | "deCelular" | "referenciaExterna">) =>
  m.direction === "OUTBOUND" && !ehDaIa(m) && (m.senderUserId !== null || m.deCelular);

const ROTULO_MIDIA: Record<string, string> = { IMAGE: "[foto]", VIDEO: "[vídeo]", AUDIO: "[áudio]", DOCUMENT: "[documento]", STICKER: "[figurinha]" };
const textoDaMensagem = (m: MensagemDaConversa) => [m.mediaType ? (ROTULO_MIDIA[m.mediaType] ?? "[anexo]") : "", m.body.trim()].filter(Boolean).join(" ");

export type TurnoDoHistorico = { de: "empresa" | "nos"; texto: string };

/**
 * A conversa (em ordem cronológica) → turnos para o modelo. Mensagens seguidas do mesmo lado viram uma só. Só faz
 * sentido responder quando a última palavra é da empresa: senão devolve null. Cada texto é cortado, para uma
 * mensagem enorme não estourar o limite de entrada.
 */
export function montarHistorico(mensagens: MensagemDaConversa[], maxCaracteres = 500): TurnoDoHistorico[] | null {
  const blocos: { de: "empresa" | "nos"; partes: string[] }[] = [];
  for (const m of mensagens) {
    if (m.isDeleted) continue;
    const texto = textoDaMensagem(m);
    if (!texto) continue;
    const de = m.direction === "INBOUND" ? "empresa" : "nos";
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.de === de) ultimo.partes.push(texto);
    else blocos.push({ de, partes: [texto] });
  }
  if (!blocos.length || blocos[blocos.length - 1].de !== "empresa") return null;
  return blocos.map((b) => ({ de: b.de, texto: b.partes.join("\n").slice(0, maxCaracteres) }));
}

export type EstadoDaConversa = {
  /** O que o vendedor já guardou desta conversa (null = ainda não atendeu). */
  conversa: { status: "ATIVA" | "TRANSFERIDA" | "ENCERRADA"; respondidoAte: Date | null; turnos: number; iniciadaEm: Date; proximaTentativaEm: Date | null } | null;
  /** As mensagens recentes, em ordem cronológica. */
  mensagens: MensagemDaConversa[];
  /** Quantas mensagens a consulta trouxe no máximo: se vieram todas, a conversa pode ser mais longa que a janela. */
  janela: number;
  ativadoEm: Date;
  limiteTurnos: number;
  horaInicio: number;
  horaFim: number;
};

export type Decisao =
  | { acao: "responder" }
  | { acao: "esperar"; motivo: string }
  | { acao: "ignorar"; motivo: string }
  | { acao: "transferir"; motivo: string };

export const ESPERA_MS = 8_000;
/** Uma resposta da empresa fica esperando a próxima janela de horário; passou disso, ninguém mais a responde por robô. */
export const VELHA_MS = 48 * 3_600_000;

/** Segunda a sábado, das `inicio` às `fim` (exclusive), no horário de Brasília. */
export function dentroDoHorario(agora: Date, inicio: number, fim: number): boolean {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(agora);
  const dia = partes.find((p) => p.type === "weekday")?.value;
  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  if (dia === "Sun") return false;
  return hora >= inicio && hora < fim;
}

/**
 * O que fazer com uma conversa agora.
 *
 *  - Só fala depois da empresa: a última mensagem tem de ser dela, e a conversa tem de ter começado por uma
 *    abordagem nossa (a equipe falou antes da primeira resposta da empresa).
 *  - Espera alguns segundos de silêncio, para responder de uma vez quem escreve em pedaços.
 *  - Pessoa da equipe falou depois que a IA começou, ou já tinha respondido a empresa antes de a IA chegar:
 *    a conversa é dela, e a IA sai (ou nem entra).
 *  - Fora do horário a IA espera; a resposta sai na próxima janela. Passou de 48 h, não responde.
 *  - Depois de N respostas, passa para uma pessoa.
 */
export function decidir(e: EstadoDaConversa, agora: Date): Decisao {
  const validas = e.mensagens.filter((m) => !m.isDeleted);
  const ultima = validas[validas.length - 1];
  if (!ultima) return { acao: "ignorar", motivo: "sem mensagens" };

  if (e.conversa && e.conversa.status !== "ATIVA") return { acao: "ignorar", motivo: e.conversa.status === "TRANSFERIDA" ? "já transferida" : "já encerrada" };

  if (e.conversa && validas.some((m) => m.createdAt > e.conversa!.iniciadaEm && ehDaEquipe(m))) return { acao: "transferir", motivo: "equipe respondeu" };

  if (ultima.direction !== "INBOUND") return { acao: "ignorar", motivo: "a última mensagem é nossa" };
  if (ultima.createdAt <= e.ativadoEm) return { acao: "ignorar", motivo: "mensagem de antes de ligar o vendedor" };
  if (e.conversa?.respondidoAte && ultima.createdAt <= e.conversa.respondidoAte) return { acao: "ignorar", motivo: "já tratada" };

  if (!e.conversa) {
    // Conversa longa demais para a janela: não dá para saber se a equipe já atendia.
    if (e.mensagens.length >= e.janela) return { acao: "ignorar", motivo: "conversa longa demais para assumir" };
    const primeira = validas.find((m) => m.direction === "INBOUND")!;
    if (!validas.some((m) => ehDaEquipe(m) && m.createdAt < primeira.createdAt)) return { acao: "ignorar", motivo: "a conversa não começou por uma abordagem nossa" };
    if (validas.some((m) => ehDaEquipe(m) && m.createdAt > primeira.createdAt)) return { acao: "ignorar", motivo: "a equipe já atendia" };
  }

  const idade = agora.getTime() - ultima.createdAt.getTime();
  if (idade > VELHA_MS) return { acao: "ignorar", motivo: "mensagem velha" };
  if (e.conversa && e.conversa.turnos >= e.limiteTurnos) return { acao: "transferir", motivo: "limite de respostas da IA na conversa" };
  if (idade < ESPERA_MS) return { acao: "esperar", motivo: "aguardando o fim da digitação" };
  if (e.conversa?.proximaTentativaEm && e.conversa.proximaTentativaEm > agora) return { acao: "esperar", motivo: "aguardando nova tentativa" };
  if (!dentroDoHorario(agora, e.horaInicio, e.horaFim)) return { acao: "esperar", motivo: "fora do horário" };
  return { acao: "responder" };
}

/** O WhatsApp marca negrito com um asterisco; o modelo às vezes escreve em Markdown. */
export function paraWhatsApp(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Todos os endereços que aparecem no texto (com ou sem http). */
export function linksDoTexto(texto: string): string[] {
  return texto.match(/(?:https?:\/\/|www\.)[^\s)]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|app|dev|io|me|ly|gl)(?:\.br)?(?:\/[^\s)]*)?/gi) ?? [];
}

const hostDe = (link: string) => {
  try {
    return new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

/**
 * O modelo só pode citar o link da agenda da campanha e o site da própria Dilon Tech. Qualquer outro endereço (que
 * ele pode ter inventado, ou que veio de uma mensagem maliciosa) barra o envio.
 */
export function linksNaoPermitidos(texto: string, permitidos: (string | null | undefined)[]): string[] {
  const hosts = new Set(permitidos.map((p) => (p ? hostDe(p) : null)).filter((h): h is string => !!h));
  return linksDoTexto(texto).filter((l) => {
    const h = hostDe(l);
    return !h || !(hosts.has(h) || [...hosts].some((p) => h.endsWith(`.${p}`)));
  });
}
