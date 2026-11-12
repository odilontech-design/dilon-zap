import { normalizar } from "../texto";

/**
 * Sugestão de marca, modelo e versão do catálogo da OLX a partir do que está
 * na ficha. Os nomes não batem letra a letra ("Volkswagen" x "VW - VOLKSWAGEN",
 * "TSI 1.0" x "1.0 200 TSI COMFORTLINE"), então a escolha é por palavras em
 * comum. A loja confirma na tela; aqui só vem a lista em ordem de chance.
 */

export type OpcaoCatalogo = { id: string; nome: string; nota: number };

const ALIASES: Record<string, string[]> = {
  volkswagen: ["vw"],
  chevrolet: ["gm"],
  "mercedes benz": ["mercedes", "mb"],
};

function palavras(s: string): string[] {
  return normalizar(s).split(" ").filter(Boolean);
}

/** Nota de 0 a 1: quanto do texto procurado aparece na opção (com um bônus para igual). */
export function nota(procurado: string, opcao: string): number {
  const p = normalizar(procurado);
  const o = normalizar(opcao);
  if (!p || !o) return 0;
  if (p === o) return 1;
  const tp = palavras(p);
  const to = new Set(palavras(o));
  const extras = (ALIASES[p] ?? []).some((a) => to.has(a));
  const comuns = tp.filter((t) => to.has(t)).length;
  let n = comuns / Math.max(tp.length, 1);
  if (extras) n = Math.max(n, 0.9);
  // Desempate: opção com menos palavras sobrando é mais provável ("Gol" > "Gol Special").
  n -= Math.max(0, to.size - comuns) * 0.03;
  if (o.startsWith(p) || p.startsWith(o)) n = Math.max(n, 0.85);
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}

export function sugerir(procurado: string | null | undefined, opcoes: Record<string, number | string>, max = 8): OpcaoCatalogo[] {
  const lista = Object.entries(opcoes).map(([nome, id]) => ({ id: String(id), nome, nota: procurado ? nota(procurado, nome) : 0 }));
  lista.sort((a, b) => b.nota - a.nota || a.nome.localeCompare(b.nome, "pt-BR"));
  return procurado ? lista.filter((o) => o.nota > 0).slice(0, max) : lista;
}

/** A sugestão serve para escolher sozinha quando a melhor é clara. */
export function escolhaSegura(opcoes: OpcaoCatalogo[]): OpcaoCatalogo | null {
  const [a, b] = opcoes;
  if (!a || a.nota < 0.85) return null;
  if (a.nota === 1 && (!b || b.nota < 1)) return a; // nome igual
  if (b && b.nota >= a.nota - 0.1) return null;
  return a;
}
