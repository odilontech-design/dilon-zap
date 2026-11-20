import { somarDias } from "./tempo";

export interface Feriado {
  /** "AAAA-MM-DD" */
  data: string;
  nome: string;
}

/**
 * Feriados nacionais (Lei 662/1949 com alterações, Lei 6.802/1980 e Lei
 * 14.759/2023, que tornou nacional o Dia da Consciência Negra a partir de
 * 2024), mais a Sexta-feira Santa, que é móvel.
 *
 * Carnaval e Corpus Christi NÃO estão aqui: são ponto facultativo no plano
 * federal e feriado só onde lei estadual ou municipal disser. A empresa
 * cadastra os da cidade dela.
 */
export function feriadosNacionais(ano: number): Feriado[] {
  const d = (mmdd: string) => `${ano}-${mmdd}`;
  const lista: Feriado[] = [
    { data: d("01-01"), nome: "Confraternização Universal" },
    { data: somarDias(pascoa(ano), -2), nome: "Sexta-feira Santa" },
    { data: d("04-21"), nome: "Tiradentes" },
    { data: d("05-01"), nome: "Dia do Trabalho" },
    { data: d("09-07"), nome: "Independência do Brasil" },
    { data: d("10-12"), nome: "Nossa Senhora Aparecida" },
    { data: d("11-02"), nome: "Finados" },
    { data: d("11-15"), nome: "Proclamação da República" },
    { data: d("12-25"), nome: "Natal" },
  ];
  if (ano >= 2024) lista.push({ data: d("11-20"), nome: "Dia Nacional de Zumbi e da Consciência Negra" });
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
