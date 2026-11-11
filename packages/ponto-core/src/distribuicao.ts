import { MINUTOS_DIA, type Minuto, type Periodo } from "./tempo";

/**
 * Qual marcação pertence a qual jornada.
 *
 * Virar o dia à meia-noite não funciona: a saída das 06:00 de quem entrou às
 * 22:00 cairia no dia seguinte e as duas jornadas sairiam erradas. Cada dia
 * ganha uma **janela** que começa um pouco antes do primeiro turno previsto:
 *
 * - dia com turno previsto: começa `antecedenciaMin` (4h) antes do primeiro
 *   turno. Comercial às 08:00 → janela a partir das 04:00; noturno às 22:00
 *   → a partir das 18:00, e a saída das 06:00 do dia seguinte ainda é dele;
 * - dia sem turno (folga, domingo): começa às 04:00;
 * - nunca antes de `folgaAposFimMin` (2h) depois do fim previsto da jornada
 *   anterior, para a folga depois de um turno noturno não "roubar" a saída.
 *
 * É uma regra de bom senso, não de lei. Marcação que cair no dia errado se
 * corrige com tratamento (desconsiderar e incluir), como qualquer outro ajuste.
 */

export interface OpcoesDistribuicao {
  antecedenciaMin: number;
  inicioDiaSemTurnoMin: number;
  folgaAposFimMin: number;
}

export const DISTRIBUICAO_PADRAO: OpcoesDistribuicao = {
  antecedenciaMin: 4 * 60,
  inicioDiaSemTurnoMin: 4 * 60,
  folgaAposFimMin: 2 * 60,
};

/**
 * Início da janela de cada dia, em minutos absolutos contados da meia-noite do
 * dia 0. `previstos[i]` são os turnos do dia i, na linha do tempo do próprio
 * dia i (como em `apurarDia`).
 */
export function iniciosDasJanelas(previstos: Periodo[][], opcoes = DISTRIBUICAO_PADRAO): Minuto[] {
  const inicios: Minuto[] = [];
  let fimAnterior = -Infinity;
  previstos.forEach((turnos, i) => {
    const base = i * MINUTOS_DIA;
    let inicio =
      turnos.length > 0
        ? base + Math.min(...turnos.map((t) => t.inicio)) - opcoes.antecedenciaMin
        : base + opcoes.inicioDiaSemTurnoMin;
    inicio = Math.max(inicio, fimAnterior + opcoes.folgaAposFimMin);
    if (i > 0) inicio = Math.max(inicio, inicios[i - 1] + 1);
    inicios.push(inicio);
    if (turnos.length > 0) fimAnterior = base + Math.max(...turnos.map((t) => t.fim));
  });
  return inicios;
}

/**
 * Reparte marcações (minutos absolutos desde a meia-noite do dia 0) entre os
 * dias. Devolve, para cada dia, as marcações já na linha do tempo daquele dia.
 * Marcação antes da janela do dia 0 é descartada; depois da janela do último
 * dia vai para o último dia (quem chama deve pedir um dia a mais de folga).
 */
export function distribuirMarcacoes(
  marcacoes: Minuto[],
  previstos: Periodo[][],
  opcoes = DISTRIBUICAO_PADRAO,
): Minuto[][] {
  const inicios = iniciosDasJanelas(previstos, opcoes);
  const porDia: Minuto[][] = previstos.map(() => []);
  for (const m of [...marcacoes].sort((a, b) => a - b)) {
    let dia = -1;
    for (let i = inicios.length - 1; i >= 0; i--) {
      if (m >= inicios[i]) {
        dia = i;
        break;
      }
    }
    if (dia >= 0) porDia[dia].push(m - dia * MINUTOS_DIA);
  }
  return porDia;
}
