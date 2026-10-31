import { digitosVerificadoresDoCnpj } from "../../sdr-core/src/normalizacao";

/**
 * CNPJs de teste, gerados por cálculo (base + dígitos verificadores). Não são de
 * empresas reais: o número base é só um contador.
 */
export function cnpjDe(n: number): string {
  const base = String(n).padStart(12, "0");
  return base + digitosVerificadoresDoCnpj(base);
}

export type LinhaCsv = Partial<Record<"cnpj" | "razao" | "fantasia" | "telefone" | "email" | "site" | "uf" | "cidade" | "segmento" | "porte" | "cnae", string>>;

export const CABECALHO_CSV = ["CNPJ", "Razão Social", "Nome Fantasia", "Telefone", "E-mail", "Site", "UF", "Cidade", "Segmento", "Porte", "CNAE"];

/** Monta um CSV com ponto e vírgula e cabeçalho padrão, a partir de linhas parciais. */
export function montarCsv(linhas: LinhaCsv[]): string {
  const celula = (v = "") => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const corpo = linhas.map((l) => [l.cnpj, l.razao, l.fantasia, l.telefone, l.email, l.site, l.uf, l.cidade, l.segmento, l.porte, l.cnae].map(celula).join(";"));
  return [CABECALHO_CSV.join(";"), ...corpo].join("\n") + "\n";
}
