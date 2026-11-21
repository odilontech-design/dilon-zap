/**
 * Conferência do relógio do servidor (Portaria 671, Anexo IX, item 2: o REP-P
 * mantém sincronismo com a Hora Legal Brasileira com variação de no máximo 30
 * segundos).
 *
 * O servidor (Vercel/AWS) já sincroniza o relógio por NTP com fontes UTC, e a
 * Hora Legal Brasileira é o UTC disseminado pelo Observatório Nacional com o
 * fuso aplicado. Esta conferência é a prova contínua: compara a hora do
 * servidor com o cabeçalho Date de um servidor de referência (padrão:
 * www.gov.br) e mostra a diferença nas Configurações. Resolução de 1 segundo,
 * suficiente para o limite de 30.
 */
const REFERENCIA = process.env.PONTO_REFERENCIA_HORA_URL || "https://www.gov.br/";
const LIMITE_S = 30;
const VALIDADE_MS = 10 * 60_000;

export interface SituacaoRelogio {
  diferencaS: number | null;
  dentroDoLimite: boolean | null;
  conferidoEm: Date;
  referencia: string;
  erro?: string;
}

let ultima: SituacaoRelogio | null = null;

export async function conferirRelogio(forcar = false): Promise<SituacaoRelogio> {
  if (!forcar && ultima && Date.now() - ultima.conferidoEm.getTime() < VALIDADE_MS) return ultima;
  const referencia = new URL(REFERENCIA).host;
  try {
    const antes = Date.now();
    const r = await fetch(REFERENCIA, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) });
    const depois = Date.now();
    const cabecalho = r.headers.get("date");
    if (!cabecalho) throw new Error("a referência não informou a hora");
    // O Date vem truncado no segundo: compara com o meio da ida e volta.
    const diferencaS = Math.round(((antes + depois) / 2 - new Date(cabecalho).getTime()) / 1000);
    ultima = { diferencaS, dentroDoLimite: Math.abs(diferencaS) <= LIMITE_S, conferidoEm: new Date(), referencia };
  } catch (err) {
    ultima = { diferencaS: null, dentroDoLimite: null, conferidoEm: new Date(), referencia, erro: (err as Error).message };
  }
  return ultima;
}
