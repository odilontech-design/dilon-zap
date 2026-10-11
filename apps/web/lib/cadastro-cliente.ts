/**
 * Cadastro do cliente: o endereço em partes vira a linha única que o recibo
 * imprime. Puro, para a ficha e a rota concordarem no formato.
 */

export type EnderecoPartes = {
  logradouro?: string | null;
  numeroEndereco?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
};

const t = (v: string | null | undefined) => v?.trim() || "";

/** "Rua A, 10 - Apto 2 - Centro - Niterói/RJ - CEP 24000-000"; null se não há nada. */
export function montarEndereco(p: EnderecoPartes): string | null {
  const rua = [t(p.logradouro), t(p.numeroEndereco)].filter(Boolean).join(", ");
  const cidadeUf = [t(p.cidade), t(p.uf).toUpperCase()].filter(Boolean).join("/");
  const cep = formatarCep(p.cep);
  const partes = [rua, t(p.complemento), t(p.bairro), cidadeUf, cep ? `CEP ${cep}` : ""].filter(Boolean);
  return partes.length ? partes.join(" - ") : null;
}

/** "24000000" → "24000-000". Qualquer coisa que não tenha 8 dígitos volta como veio. */
export function formatarCep(cep: string | null | undefined): string {
  const d = (cep ?? "").replace(/\D/g, "");
  if (d.length !== 8) return t(cep);
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export const CAMPOS_ENDERECO = ["logradouro", "numeroEndereco", "complemento", "bairro", "cidade", "uf", "cep"] as const;
