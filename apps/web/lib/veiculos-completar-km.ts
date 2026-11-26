/**
 * Apoios da tela "Completar" para digitar a quilometragem de muitos carros: colar uma lista da planilha
 * (placa e km), baixar a lista para levar ao pátio e avisar quando a km parece valor padrão ou baixa
 * demais. Puro: sem banco. A km é sempre a lida no odômetro; o Zap nunca preenche um número por conta própria.
 */

export const limparPlaca = (p: string | null | undefined) => (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Quilômetro digitado ("45.300", "45300", "45 300", "45300 km") → número; vazio → null; lixo → undefined. */
export function lerKm(t: string): number | null | undefined {
  const d = t.replace(/km/gi, "").replace(/[.\s]/g, "");
  if (!d) return null;
  return /^\d{1,7}$/.test(d) ? Number(d) : undefined;
}

type CarroDaLista = { id: string; placa: string | null };

/**
 * Lê linhas coladas do Excel ou do bloco de notas: "ABC1D23  45300", "ABC-1234;45.300", "ABC1D23<TAB>45300 km".
 * Devolve a km a preencher por carro (pela placa) e o que não deu para aproveitar.
 */
export function lerListaColada(texto: string, carros: CarroDaLista[]): { preenchidos: Record<string, string>; semCarro: string[]; invalidas: string[] } {
  const porPlaca = new Map(carros.filter((c) => c.placa).map((c) => [limparPlaca(c.placa), c.id]));
  const preenchidos: Record<string, string> = {};
  const semCarro: string[] = [];
  const invalidas: string[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    const m = linha.match(/^([A-Za-z]{3}-?\d[A-Za-z0-9]\d{2})[\s;,\t]+(.+)$/);
    if (!m) {
      invalidas.push(linha);
      continue;
    }
    const placa = limparPlaca(m[1]);
    const km = lerKm(m[2]);
    if (typeof km !== "number") {
      invalidas.push(linha);
      continue;
    }
    const id = porPlaca.get(placa);
    if (!id) {
      semCarro.push(placa);
      continue;
    }
    preenchidos[id] = String(km);
  }
  return { preenchidos, semCarro, invalidas };
}

/** A lista para levar ao pátio ou abrir no Excel (separador ";", com BOM para os acentos). */
export function csvDaLista(carros: { placa: string | null; nome: string }[]): string {
  const celula = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const linhas = carros.map((c) => [c.placa ?? "", c.nome, ""].map(celula).join(";"));
  return "﻿" + ["Placa;Carro;Km (lida no odômetro)", ...linhas].join("\r\n");
}

/** Aviso (não bloqueia) para a km digitada de um carro: baixa demais para a idade. */
export function avisoDeKm(km: number | null | undefined, anoModelo: number, anoAtual = new Date().getFullYear()): string | null {
  if (typeof km !== "number") return null;
  if (km < 500 && anoModelo <= anoAtual - 1) return `km muito baixa para um carro ${anoModelo}: confira o odômetro`;
  return null;
}

/** Quantos carros receberam o mesmo valor de km (a partir de 4): sinal de número padrão digitado por engano. */
export function kmRepetidos(valores: (number | null | undefined)[]): { km: number; quantos: number } | null {
  const contagem = new Map<number, number>();
  for (const v of valores) if (typeof v === "number") contagem.set(v, (contagem.get(v) ?? 0) + 1);
  let pior: { km: number; quantos: number } | null = null;
  for (const [km, quantos] of contagem) if (quantos >= 4 && (!pior || quantos > pior.quantos)) pior = { km, quantos };
  return pior;
}
