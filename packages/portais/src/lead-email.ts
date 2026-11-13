import { createHash } from "node:crypto";
import { simpleParser } from "mailparser";
import { normalizar } from "./texto";
import { telefoneDoLead } from "./olx/lead";

/**
 * Leitor dos e-mails de lead dos portais (Na Pista, MobiAuto, Webmotors, OLX...).
 * Os portais mandam o contato do comprador por e-mail para a loja; a loja
 * encaminha para o endereço do Zap e o leitor tira dali nome, telefone, e-mail,
 * a mensagem e o carro. Cada portal escreve de um jeito, então o leitor é
 * deliberadamente tolerante (rótulos "Nome:", "Telefone:", tabelas em HTML,
 * encaminhado pelo Gmail) e, quando não entende, devolve o motivo: o e-mail
 * fica guardado para a equipe e para ajustarmos o leitor àquele portal.
 */

export type PortalDeLead = "OLX" | "WEBMOTORS" | "MOBIAUTO" | "NAPISTA";

export type LeadDeEmail = {
  portal: PortalDeLead;
  chave: string;
  nome: string;
  email: string | null;
  /** Só dígitos, com DDI 55; nulo quando não veio telefone utilizável. */
  telefone: string | null;
  mensagem: string;
  /** O carro como o e-mail descreve ("Honda Civic 2.0 2018"). */
  veiculoTexto: string | null;
  placa: string | null;
  linkAnuncio: string | null;
  criadoEm: Date;
};

export type EmailLido = { messageId: string; de: string; assunto: string; texto: string; recebidoEm: Date };

export const PORTAIS_POR_PISTA: [PortalDeLead, RegExp][] = [
  ["WEBMOTORS", /webmotors/i],
  ["MOBIAUTO", /mobiauto/i],
  ["NAPISTA", /na\s?pista|napista/i],
  ["OLX", /\bolx\b/i],
];

export function detectarPortal(pistas: string): PortalDeLead | null {
  for (const [p, re] of PORTAIS_POR_PISTA) if (re.test(pistas)) return p;
  return null;
}

const ROTULOS = {
  nome: /^(?:nome(?: completo)?|cliente|interessado|name|comprador)$/i,
  telefone: /^(?:telefone|tel|celular|fone|whats(?:app)?|phone|contato|telefone\/whatsapp)$/i,
  email: /^e-?mail$/i,
  mensagem: /^(?:mensagem|message|observa[cç][aã]o|coment[aá]rio|recado|texto)$/i,
  veiculo: /^(?:ve[ií]culo|carro|an[uú]ncio|modelo|ve[ií]culo de interesse|produto)$/i,
  placa: /^placa$/i,
};

/** Pares "Rótulo: valor" (ou "Rótulo - valor"), um por linha; o valor da mensagem pode continuar nas linhas seguintes. */
export function paresDoTexto(texto: string): { rotulo: string; valor: string }[] {
  const linhas = texto.split(/\r?\n/);
  const pares: { rotulo: string; valor: string }[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(/^\s*[*>\-\s]*([A-Za-zÀ-ú\/ ]{2,30}?)\s*[:：]\s*(.*)$/);
    if (!m) {
      // Tabela em HTML: "Nome" numa linha e o valor na seguinte.
      const solto = linhas[i].trim();
      if (solto && Object.values(ROTULOS).some((re) => re.test(solto)) && linhas[i + 1]?.trim()) pares.push({ rotulo: solto, valor: linhas[++i].trim() });
      continue;
    }
    let valor = m[2].trim();
    const rot = m[1].trim();
    if (ROTULOS.mensagem.test(rot)) {
      while (i + 1 < linhas.length && linhas[i + 1].trim() && !/^\s*[A-Za-zÀ-ú\/ ]{2,30}[:：]/.test(linhas[i + 1])) valor += ` ${linhas[++i].trim()}`;
    }
    // "Nome:\nJoão" (valor na linha de baixo)
    if (!valor && i + 1 < linhas.length && linhas[i + 1].trim() && !/[:：]/.test(linhas[i + 1])) valor = linhas[++i].trim();
    if (valor) pares.push({ rotulo: rot, valor });
  }
  return pares;
}

const REGEX_TELEFONE = /(?:\+?55[\s.-]*)?\(?\b(\d{2})\)?[\s.-]*(9?\d{4})[\s.-]?(\d{4})\b/;
const REGEX_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const REGEX_PLACA = /\b([A-Z]{3}-?\d[A-Z0-9]\d{2})\b/;

/** Endereços que são do portal ou do encaminhamento, não do comprador. */
const EMAIL_DO_SISTEMA = /(no-?reply|nao-?responda|naoresponda|mailer-daemon|notific|webmotors|mobiauto|napista|na-pista|olx|autocerto|dilontech|leads@)/i;

function limpar(v: string | null | undefined, max: number): string | null {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

export function extrairCampos(texto: string) {
  const pares = paresDoTexto(texto);
  const achar = (re: RegExp) => pares.find((p) => re.test(p.rotulo))?.valor ?? null;

  const nome = limpar(achar(ROTULOS.nome), 120);
  const telTexto = achar(ROTULOS.telefone);
  let telefone = telTexto ? telefoneDoLead(telTexto.replace(/\D/g, "").length >= 10 ? telTexto : "") : null;
  if (!telefone) {
    // Sem rótulo: o primeiro número com cara de telefone brasileiro (e não de CEP, placa ou preço).
    const m = texto.replace(/R\$\s?[\d.,]+/g, " ").match(REGEX_TELEFONE);
    if (m) telefone = telefoneDoLead(`${m[1]}${m[2]}${m[3]}`);
  }
  let email = limpar(achar(ROTULOS.email), 160)?.toLowerCase() ?? null;
  if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) email = null;
  if (!email) email = (texto.match(REGEX_EMAIL) ?? []).find((e) => !EMAIL_DO_SISTEMA.test(e))?.toLowerCase() ?? null;

  const mensagem = limpar(achar(ROTULOS.mensagem), 1000) ?? "";
  const veiculoTexto = limpar(achar(ROTULOS.veiculo), 200);
  const placa = (limpar(achar(ROTULOS.placa), 10) ?? texto.match(REGEX_PLACA)?.[1] ?? null)?.toUpperCase().replace("-", "") ?? null;
  const link = texto.match(/https?:\/\/[^\s"'<>)]+/g)?.find((u) => /(webmotors|mobiauto|napista|olx).*(comprar|carro|veiculo|anuncio|detalhe|vehicle|\d{5,})/i.test(u)) ?? null;
  return { nome, telefone, email, mensagem, veiculoTexto, placa, linkAnuncio: link ? link.slice(0, 300) : null };
}

/** Lê o e-mail bruto (RFC 822) e devolve o essencial para a central de leads. */
export async function lerEmail(raw: string | Buffer): Promise<EmailLido & { pistas: string }> {
  const m = await simpleParser(raw);
  const de = m.from?.text ?? "";
  const assunto = m.subject ?? "";
  const html = typeof m.html === "string" ? m.html : "";
  const temPlano = /content-type:\s*text\/plain/i.test(typeof raw === "string" ? raw : raw.toString("latin1"));
  // Só HTML: o texto que o mailparser deriva cola as células da tabela; separamos nós mesmos.
  const doHtml = html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<(br|\/p|\/tr|\/div|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<\/t[dh]>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  const texto = (temPlano && m.text?.trim() ? m.text : html ? doHtml : (m.text ?? "")).replace(/[ \t]+/g, " ");
  const replyTo = m.replyTo?.text ?? "";
  const messageId = m.messageId ?? createHash("sha256").update([de, assunto, m.date?.toISOString() ?? "", texto.slice(0, 500)].join("|")).digest("hex").slice(0, 40);
  return { messageId, de, assunto, texto, recebidoEm: m.date ?? new Date(), pistas: `${de} ${replyTo} ${assunto} ${texto.slice(0, 4000)}` };
}

export function entenderEmail(e: EmailLido & { pistas: string }): { ok: true; lead: LeadDeEmail } | { ok: false; motivo: string } {
  const portal = detectarPortal(e.pistas);
  if (!portal) return { ok: false, motivo: "não reconheci de qual portal é o e-mail" };
  const c = extrairCampos(e.texto);
  if (!c.telefone && !c.email) return { ok: false, motivo: "não achei telefone nem e-mail do comprador" };
  const chave = createHash("sha256").update(`${portal}|${e.messageId}`).digest("hex").slice(0, 32);
  return {
    ok: true,
    lead: {
      portal,
      chave,
      nome: c.nome ?? "Contato do portal",
      email: c.email,
      telefone: c.telefone,
      mensagem: c.mensagem,
      veiculoTexto: c.veiculoTexto ?? limparAssunto(e.assunto),
      placa: c.placa,
      linkAnuncio: c.linkAnuncio,
      criadoEm: e.recebidoEm,
    },
  };
}

/** "Novo lead: Honda Civic 2018" → "Honda Civic 2018" (o assunto muitas vezes traz o carro). */
function limparAssunto(a: string): string | null {
  const t = a.replace(/^\s*((?:re|enc|fwd?|fw):\s*)*/i, "").replace(/^(novo\s+)?(lead|contato|interesse|proposta|mensagem)[^:]*:\s*/i, "");
  return limpar(normalizar(t).length > 3 ? t : null, 200);
}
