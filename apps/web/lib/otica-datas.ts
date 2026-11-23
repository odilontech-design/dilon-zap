/**
 * Datas suspeitas nas OS do talão de papel (Visuallis, 23/11). Puro, sem banco.
 *
 * A leitura por IA erra o ano ("2025" lido como "2015") ou o mês ("04" como
 * "01"), e a data errada vai parar no Histórico, no gráfico por ano e no
 * Financeiro. O talão é numerado em sequência: a OS 0068 foi feita perto da
 * 0067 e da 0070. Então uma data muito longe das OS de número vizinho é
 * suspeita — e a data certa costuma estar a uma troca de ano ou de mês dali.
 *
 * É só um aviso: quem decide é a pessoa. O sistema sugere, nunca troca sozinho.
 */

const DIA_MS = 86_400_000;
const BRT_MS = 3 * 60 * 60 * 1000;

/** Distância (em dias) da mediana dos vizinhos a partir da qual a data vira suspeita. */
export const LIMITE_DE_DIAS = 45;
/** Quantas OS de cada lado entram na comparação. */
const VIZINHOS_DE_CADA_LADO = 3;
/** Com menos vizinhos que isso não há comparação que se sustente. */
const MIN_VIZINHOS = 3;

export type OSParaConferir = { id: string; numero: number; data: Date };

export type DataSuspeita = {
  /** Mediana das datas das OS vizinhas, "AAAA-MM-DD". */
  vizinhasPor: string;
  /** Datas candidatas (mesmo dia, ano ou mês trocado), da mais perto da mediana para a mais longe. */
  sugestoes: string[];
};

function dia(d: Date) {
  const b = new Date(d.getTime() - BRT_MS);
  return { ano: b.getUTCFullYear(), mes: b.getUTCMonth() + 1, dia: b.getUTCDate() };
}

function texto(ano: number, mes: number, d: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Existe esse dia no calendário? ("2025-02-30" não.) */
function valida(ano: number, mes: number, d: number): boolean {
  const x = new Date(Date.UTC(ano, mes - 1, d));
  return x.getUTCFullYear() === ano && x.getUTCMonth() === mes - 1 && x.getUTCDate() === d;
}

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function emMs(txt: string): number {
  return new Date(`${txt}T12:00:00Z`).getTime();
}

/**
 * Quais OS têm data fora da sequência do talão, e o que sugerir no lugar.
 * Recebe só as OS do papel: as feitas no sistema nascem com a data certa.
 */
export function detectarDatasSuspeitas(ordens: OSParaConferir[]): Map<string, DataSuspeita> {
  const porNumero = [...ordens].sort((a, b) => a.numero - b.numero);
  const resultado = new Map<string, DataSuspeita>();

  porNumero.forEach((o, i) => {
    const vizinhos = [
      ...porNumero.slice(Math.max(0, i - VIZINHOS_DE_CADA_LADO), i),
      ...porNumero.slice(i + 1, i + 1 + VIZINHOS_DE_CADA_LADO),
    ];
    if (vizinhos.length < MIN_VIZINHOS) return;

    const med = mediana(vizinhos.map((v) => v.data.getTime()));
    if (Math.abs(o.data.getTime() - med) <= LIMITE_DE_DIAS * DIA_MS) return;

    const m = dia(new Date(med));
    const d = dia(o.data);
    // Duas trocas possíveis: só o ano (2015 → 2025) ou o ano e o mês (01/12 → 12/04 do ano dos vizinhos).
    const candidatas = new Set<string>();
    if (valida(m.ano, d.mes, d.dia)) candidatas.add(texto(m.ano, d.mes, d.dia));
    if (valida(m.ano, m.mes, d.dia)) candidatas.add(texto(m.ano, m.mes, d.dia));

    const atual = texto(d.ano, d.mes, d.dia);
    const sugestoes = [...candidatas]
      .filter((c) => c !== atual && Math.abs(emMs(c) - med) <= LIMITE_DE_DIAS * DIA_MS)
      .sort((a, b) => Math.abs(emMs(a) - med) - Math.abs(emMs(b) - med));

    const viz = dia(new Date(med));
    resultado.set(o.id, { vizinhasPor: texto(viz.ano, viz.mes, viz.dia), sugestoes });
  });

  return resultado;
}

/**
 * Aviso na hora de conferir a leitura de uma OS do papel, ainda sem vizinhas
 * para comparar: data no futuro ou de muitos anos atrás é quase sempre o ano
 * lido errado. Devolve o texto do aviso, ou null se a data parece normal.
 */
export function avisoDeDataNaLeitura(diaLido: string, hoje = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(diaLido)) return null;
  const d = new Date(`${diaLido}T12:00:00Z`).getTime();
  const agora = hoje.getTime();
  if (d > agora + DIA_MS) return "Essa data está no futuro. Confira o ano no talão.";
  if (d < agora - 3 * 365 * DIA_MS) return `Essa data tem mais de 3 anos (${diaLido.slice(0, 4)}). Confira o ano no talão.`;
  return null;
}
