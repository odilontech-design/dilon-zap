/**
 * Regras da ótica, puras, sem banco: etapas da ordem de serviço, o formato dos
 * graus da receita, as medidas e o texto dos avisos ao cliente.
 *
 * Os números da receita viajam como INTEIROS:
 *   - dioptria (esférico, cilíndrico, adição) em centésimos: +2,25 → 225
 *   - eixo em graus: 0 a 180
 *   - DNP, altura e medidas da armação em décimos de mm: 34,5 → 345
 * Inteiro porque +2,25 em ponto flutuante vira 2.2499999 em algum cálculo e
 * imprime errado no papel que vai para o laboratório — e grau errado é lente
 * refeita.
 *
 * Rodar o teste com: npx tsx apps/web/lib/otica-regras.test-manual.ts
 */

export type Etapa = "ABERTA" | "LABORATORIO" | "MONTAGEM" | "CONFERENCIA" | "PRONTA" | "ENTREGUE" | "CANCELADA";

/** As etapas do quadro, na ordem em que o óculos anda. Cancelada fica fora: não é coluna. */
export const ETAPAS_DO_QUADRO: Etapa[] = ["ABERTA", "LABORATORIO", "MONTAGEM", "CONFERENCIA", "PRONTA", "ENTREGUE"];

export const ROTULO_ETAPA: Record<Etapa, string> = {
  ABERTA: "Aberta",
  LABORATORIO: "No laboratório",
  MONTAGEM: "Montagem",
  CONFERENCIA: "Conferência",
  PRONTA: "Pronta para retirada",
  ENTREGUE: "Entregue",
  CANCELADA: "Cancelada",
};

/** A etapa seguinte no quadro, ou null se já está no fim (ou cancelada). */
export function proximaEtapa(etapa: Etapa): Etapa | null {
  const i = ETAPAS_DO_QUADRO.indexOf(etapa);
  if (i < 0 || i === ETAPAS_DO_QUADRO.length - 1) return null;
  return ETAPAS_DO_QUADRO[i + 1];
}

/**
 * Se a OS pode ir de uma etapa para outra.
 *
 * Voltar é permitido (a lente veio errada e volta ao laboratório; alguém
 * clicou "entregue" na OS do lado). Só a cancelada é fim de linha: reabrir uma
 * venda cancelada é outra venda, com outra OS — senão o número antigo volta a
 * circular e ninguém sabe qual via vale.
 */
export function podeMover(de: Etapa, para: Etapa): boolean {
  if (de === para) return false;
  if (de === "CANCELADA") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Receita
// ---------------------------------------------------------------------------

export type Olho = {
  esferico: number | null;
  cilindrico: number | null;
  eixo: number | null;
  dnp: number | null;
  altura: number | null;
};

export type Graus = {
  longe: { od: Olho; oe: Olho };
  perto: { od: Olho; oe: Olho };
  adicao: { od: number | null; oe: number | null };
};

export const OLHO_VAZIO: Olho = { esferico: null, cilindrico: null, eixo: null, dnp: null, altura: null };

export function grausVazios(): Graus {
  return {
    longe: { od: { ...OLHO_VAZIO }, oe: { ...OLHO_VAZIO } },
    perto: { od: { ...OLHO_VAZIO }, oe: { ...OLHO_VAZIO } },
    adicao: { od: null, oe: null },
  };
}

type Lido = { ok: true; valor: number | null } | { ok: false; erro: string };

/**
 * Lê uma dioptria como a atendente digita: "+2,00", "-0.50", "2", "-1,25",
 * "plano". Devolve centésimos. Vazio é null (campo não preenchido).
 *
 * Exige passo de 0,25: é como lente é fabricada. "+2,3" quase sempre é
 * "+2,25" ou "+2,50" digitado com pressa, e aceitar mandaria ao laboratório um
 * grau que não existe.
 */
export function lerDioptria(texto: string): Lido {
  const t = texto.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return { ok: true, valor: null };
  if (t === "plano" || t === "pl" || t === "0") return { ok: true, valor: 0 };
  const m = t.match(/^([+-]?)(\d{1,2})(?:[.,](\d{1,2}))?$/);
  if (!m) return { ok: false, erro: `"${texto}" não é um grau válido` };
  const [, sinal, inteiro, dec = "0"] = m;
  const centesimos = Number(inteiro) * 100 + Number(dec.padEnd(2, "0"));
  if (centesimos % 25 !== 0) return { ok: false, erro: `"${texto}": o grau anda de 0,25 em 0,25` };
  if (centesimos > 3000) return { ok: false, erro: `"${texto}" está fora da faixa de grau` };
  return { ok: true, valor: sinal === "-" ? -centesimos : centesimos };
}

/** Eixo do cilíndrico: 0 a 180 graus, inteiro. Aceita "105°". */
export function lerEixo(texto: string): Lido {
  const t = texto.trim().replace(/[°º\s]/g, "");
  if (!t) return { ok: true, valor: null };
  if (!/^\d{1,3}$/.test(t)) return { ok: false, erro: `"${texto}" não é um eixo válido` };
  const v = Number(t);
  if (v > 180) return { ok: false, erro: `"${texto}": o eixo vai de 0 a 180` };
  return { ok: true, valor: v };
}

/**
 * Milímetros com uma casa (DNP, altura, medidas da armação). Devolve décimos.
 *
 * Aceita "34,5", "34.5", "34" — e também "345" sem vírgula, que é como o talão
 * de papel costuma vir escrito (na OS da Visuallis a DNP aparece "340" e
 * "345"). Três dígitos sem separador viram décimos quando o número inteiro
 * não faria sentido como medida (acima de `maximo`).
 */
export function lerMilimetros(texto: string, maximo = 99): Lido {
  const t = texto.trim().replace(/\s|mm/gi, "");
  if (!t) return { ok: true, valor: null };
  const m = t.match(/^(\d{1,3})(?:[.,](\d))?$/);
  if (!m) return { ok: false, erro: `"${texto}" não é uma medida válida` };
  let decimos = Number(m[1]) * 10 + Number(m[2] ?? "0");
  if (m[2] === undefined && Number(m[1]) > maximo && m[1].length === 3) decimos = Number(m[1]);
  if (decimos / 10 > maximo) return { ok: false, erro: `"${texto}" está fora da faixa` };
  return { ok: true, valor: decimos };
}

/** +2,25 / -0,50 / 0,00. Sinal sempre explícito: é assim que a receita e o laboratório escrevem. */
export function formatarDioptria(c: number | null): string {
  if (c === null) return "";
  if (c === 0) return "0,00";
  const abs = Math.abs(c);
  return `${c > 0 ? "+" : "-"}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function formatarEixo(e: number | null): string {
  return e === null ? "" : `${e}°`;
}

/** 34,5 / 22,0. */
export function formatarMilimetros(d: number | null): string {
  if (d === null) return "";
  return `${Math.floor(d / 10)},${d % 10}`;
}

/** O grau de um olho tem algo preenchido? */
export function olhoPreenchido(o: Olho): boolean {
  return Object.values(o).some((v) => v !== null);
}

/** A receita tem grau de perto? (Muda a ficha do montador e o pedido ao laboratório.) */
export function temPerto(g: Graus): boolean {
  return olhoPreenchido(g.perto.od) || olhoPreenchido(g.perto.oe);
}

/**
 * Normaliza o Json que veio do banco ou da tela para o formato completo, sem
 * confiar que tudo está lá: receita antiga, campo novo, tela que mandou só o
 * longe. Valor que não é inteiro vira null.
 */
export function normalizarGraus(bruto: unknown): Graus {
  const g = grausVazios();
  const b = (bruto ?? {}) as Record<string, any>;
  const num = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
  const olho = (o: any): Olho => ({
    esferico: num(o?.esferico),
    cilindrico: num(o?.cilindrico),
    eixo: num(o?.eixo),
    dnp: num(o?.dnp),
    altura: num(o?.altura),
  });
  g.longe = { od: olho(b.longe?.od), oe: olho(b.longe?.oe) };
  g.perto = { od: olho(b.perto?.od), oe: olho(b.perto?.oe) };
  g.adicao = { od: num(b.adicao?.od), oe: num(b.adicao?.oe) };
  return g;
}

/**
 * Coerências que a tela avisa, sem impedir de salvar (a receita é do médico, e
 * o sistema não sabe mais que ele): cilíndrico sem eixo e eixo sem cilíndrico.
 */
export function alertasDaReceita(g: Graus): string[] {
  const alertas: string[] = [];
  const conferir = (rotulo: string, o: Olho) => {
    if (o.cilindrico !== null && o.cilindrico !== 0 && o.eixo === null) alertas.push(`${rotulo}: cilíndrico sem eixo`);
    if (o.eixo !== null && (o.cilindrico === null || o.cilindrico === 0)) alertas.push(`${rotulo}: eixo sem cilíndrico`);
  };
  conferir("Longe OD", g.longe.od);
  conferir("Longe OE", g.longe.oe);
  conferir("Perto OD", g.perto.od);
  conferir("Perto OE", g.perto.oe);
  return alertas;
}

/** Validade da receita: data da consulta + meses configurados. */
export function validadeDaReceita(dataConsulta: Date, meses: number): Date {
  const d = new Date(dataConsulta);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  // 31/01 + 1 mês não pode virar 03/03: fica no último dia do mês.
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

// ---------------------------------------------------------------------------
// Prazo e dinheiro
// ---------------------------------------------------------------------------

/** Passou da previsão e o óculos ainda não está pronto nem entregue. */
export function estaAtrasada(etapa: Etapa, previsao: Date | null, agora: Date): boolean {
  if (!previsao) return false;
  if (etapa === "PRONTA" || etapa === "ENTREGUE" || etapa === "CANCELADA") return false;
  return previsao.getTime() < agora.getTime();
}

/** Previsão de entrega a partir do prazo do laboratório, sem cair no domingo. */
export function previsaoPeloPrazo(inicio: Date, prazoDias: number): Date {
  const d = new Date(inicio);
  d.setUTCDate(d.getUTCDate() + prazoDias);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Quanto o fuso está à frente (ou atrás) do UTC naquele instante, em ms. */
function deslocamentoDoFuso(instante: number, timezone: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instante));
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - instante;
}

/**
 * "2026-11-18" e "16:00" no relógio da LOJA → o instante certo.
 *
 * A previsão de entrega é uma promessa feita no balcão, no horário da loja.
 * Montar a data no fuso do aparelho de quem digitou (um celular com o fuso
 * errado, um teste rodando em UTC) mudava o dia prometido ao cliente — a
 * mensagem chegava dizendo "13/11 a partir das 21h" para uma entrega no dia 14.
 * Sem hora, vale meia-noite da loja: "o dia todo".
 */
export function instanteNoFuso(dia: string, hora: string, timezone: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  const [h, mi] = (hora || "00:00").split(":").map(Number);
  const comoUTC = Date.UTC(a, m - 1, d, h, mi);
  // Duas passadas: o deslocamento é o do instante final, não o do palpite
  // (importa só na virada de horário de verão, mas custa uma linha).
  const palpite = comoUTC - deslocamentoDoFuso(comoUTC, timezone);
  return new Date(comoUTC - deslocamentoDoFuso(palpite, timezone));
}

/** O caminho de volta: o instante → dia e hora no relógio da loja. Meia-noite = sem hora marcada. */
export function diaHoraNoFuso(instante: Date, timezone: string): { dia: string; hora: string } {
  const local = new Date(instante.getTime() + deslocamentoDoFuso(instante.getTime(), timezone));
  const iso = local.toISOString();
  const hora = iso.slice(11, 16);
  return { dia: iso.slice(0, 10), hora: hora === "00:00" ? "" : hora };
}

export function saldoCents(valorCents: number, sinalCents: number): number {
  return Math.max(0, valorCents - sinalCents);
}

// ---------------------------------------------------------------------------
// Avisos ao cliente
// ---------------------------------------------------------------------------

export type Aviso = { ativo: boolean; texto: string };
export type Avisos = Partial<Record<Etapa, Aviso>>;

/** Etapas que podem avisar o cliente. As outras são internas da loja. */
export const ETAPAS_COM_AVISO: Etapa[] = ["LABORATORIO", "MONTAGEM", "PRONTA", "ENTREGUE"];

/**
 * Textos de fábrica. Ligados os três que o cliente quer saber: a lente foi
 * pedida, está pronto, e o obrigado. Montagem fica desligada — mensagem demais
 * num intervalo de poucos dias soa a spam, e a loja liga se quiser.
 */
export const AVISOS_PADRAO: Record<Etapa, Aviso | undefined> = {
  ABERTA: undefined,
  LABORATORIO: {
    ativo: true,
    texto:
      "Olá, {nome}! 👓 Seus óculos (OS {os}) foram enviados ao laboratório. Previsão de entrega: {previsao}. Qualquer dúvida é só responder aqui.\n— {loja}",
  },
  MONTAGEM: {
    ativo: false,
    texto: "{nome}, suas lentes chegaram e já estão na montagem (OS {os}). Falta pouco!\n— {loja}",
  },
  CONFERENCIA: undefined,
  PRONTA: {
    ativo: true,
    texto:
      "Boa notícia, {nome}! Seus óculos estão prontos 🎉 (OS {os}).\n{saldo_linha}Pode vir buscar no horário da loja. Te esperamos!\n— {loja}",
  },
  ENTREGUE: {
    ativo: true,
    texto:
      "Obrigado pela confiança, {nome}! Qualquer ajuste nos seus óculos, é só passar aqui na loja. Boas novidades à vista! 👓\n— {loja}",
  },
  CANCELADA: undefined,
};

/** O aviso que vale para uma etapa: o configurado pela loja ou o de fábrica. */
export function avisoDaEtapa(etapa: Etapa, configurados: unknown): Aviso | null {
  const c = (configurados ?? {}) as Record<string, unknown>;
  const proprio = c[etapa] as Partial<Aviso> | undefined;
  const padrao = AVISOS_PADRAO[etapa];
  if (!padrao) return null;
  if (!proprio || typeof proprio !== "object") return padrao;
  return {
    ativo: typeof proprio.ativo === "boolean" ? proprio.ativo : padrao.ativo,
    texto: typeof proprio.texto === "string" && proprio.texto.trim() ? proprio.texto : padrao.texto,
  };
}

export type VariaveisAviso = {
  nome: string;
  os: string;
  previsao: string;
  saldoCents: number;
  loja: string;
};

/** Primeiro nome, para a mensagem soar como gente: "Marilene", não "MARILENE MARIA RIBEIRO". */
export function primeiroNome(nome: string | null | undefined): string {
  const p = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!p) return "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

export function formatarReais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Monta a mensagem trocando as variáveis. {saldo_linha} só aparece quando há
 * saldo: "Saldo a pagar na retirada: R$ 725,00" numa OS quitada seria cobrar
 * quem já pagou.
 */
export function montarAviso(texto: string, v: VariaveisAviso): string {
  const saldo = v.saldoCents > 0 ? formatarReais(v.saldoCents) : "";
  return texto
    .replaceAll("{nome}", v.nome || "tudo bem")
    .replaceAll("{os}", v.os)
    .replaceAll("{previsao}", v.previsao || "a combinar")
    .replaceAll("{saldo_linha}", saldo ? `Saldo a pagar na retirada: ${saldo}\n` : "")
    .replaceAll("{saldo}", saldo || "R$ 0,00")
    .replaceAll("{loja}", v.loja)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Número da OS como no talão: 0499. */
export function numeroOS(n: number): string {
  return String(n).padStart(4, "0");
}
