import { CAMPOS, comparavel, type Bruto, type Campo } from "./normalizacao";

/** Campo do sistema → nome da coluna do arquivo (ou null, se o arquivo não tem). */
export type Mapeamento = Record<Campo, string | null>;

/** Nomes que cada campo costuma ter nos arquivos, já em forma comparável. */
const SINONIMOS: Record<Campo, string[]> = {
  cnpj: ["cnpj", "cnpj da empresa", "cnpj empresa", "numero cnpj", "n cnpj", "cnpj cpf"],
  razaoSocial: ["razao social", "razao", "razao social da empresa", "nome empresarial", "empresa", "nome da empresa", "nome empresa", "nome", "denominacao social"],
  nomeFantasia: ["nome fantasia", "fantasia", "nome comercial", "marca"],
  telefone: ["telefone", "telefone 1", "tel", "fone", "celular", "whatsapp", "contato telefone", "telefone principal", "numero de telefone"],
  email: ["email", "e mail", "e-mail", "email principal", "correio eletronico", "email contato"],
  site: ["site", "website", "web site", "url", "pagina web", "endereco do site", "site da empresa"],
  uf: ["uf", "estado", "estado uf", "sigla uf", "sigla do estado"],
  cidade: ["cidade", "municipio", "cidade municipio", "localidade"],
  segmento: ["segmento", "ramo", "setor", "ramo de atividade", "segmento de mercado", "categoria", "atividade"],
  porte: ["porte", "porte da empresa", "porte empresa"],
  cnae: ["cnae", "cnae principal", "cnae fiscal", "codigo cnae", "cnae fiscal principal", "atividade principal codigo"],
};

const limpar = (s: string) => comparavel(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Sugere o mapeamento pelos nomes das colunas. Uma coluna só serve a um campo. */
export function sugerirMapeamento(cabecalho: string[]): Mapeamento {
  const mapeamento = Object.fromEntries(CAMPOS.map((c) => [c, null])) as Mapeamento;
  const usadas = new Set<string>();
  const normalizadas = cabecalho.map((nome) => ({ nome, chave: limpar(nome) }));

  // Primeiro os nomes exatos, que são os que não deixam dúvida.
  for (const campo of CAMPOS) {
    const achada = normalizadas.find((c) => !usadas.has(c.nome) && SINONIMOS[campo].map(limpar).includes(c.chave));
    if (achada) {
      mapeamento[campo] = achada.nome;
      usadas.add(achada.nome);
    }
  }
  return mapeamento;
}

/** Confere que o mapeamento só aponta para colunas que existem e que nenhuma é usada duas vezes. */
export function validarMapeamento(mapeamento: Partial<Record<string, string | null>>, cabecalho: string[]): { mapeamento: Mapeamento; erros: string[] } {
  const erros: string[] = [];
  const resultado = Object.fromEntries(CAMPOS.map((c) => [c, null])) as Mapeamento;
  const usadas = new Set<string>();
  for (const [campo, coluna] of Object.entries(mapeamento)) {
    if (!(CAMPOS as readonly string[]).includes(campo)) {
      erros.push(`campo desconhecido no mapeamento: ${campo}`);
      continue;
    }
    if (coluna == null || coluna === "") continue;
    if (!cabecalho.includes(coluna)) {
      erros.push(`a coluna "${coluna.slice(0, 40)}" não existe no arquivo`);
      continue;
    }
    if (usadas.has(coluna)) {
      erros.push(`a coluna "${coluna.slice(0, 40)}" está ligada a mais de um campo`);
      continue;
    }
    usadas.add(coluna);
    resultado[campo as Campo] = coluna;
  }
  if (!resultado.razaoSocial && !resultado.nomeFantasia && erros.length === 0) {
    erros.push("ligue uma coluna à razão social ou ao nome fantasia");
  }
  return { mapeamento: resultado, erros };
}

/** Pega, de uma linha do arquivo, só as colunas mapeadas. Colunas sem mapeamento nunca são guardadas. */
export function extrairBruto(cabecalho: string[], celulas: string[], mapeamento: Mapeamento): Bruto {
  const bruto: Bruto = {};
  for (const campo of CAMPOS) {
    const coluna = mapeamento[campo];
    if (!coluna) continue;
    const indice = cabecalho.indexOf(coluna);
    if (indice >= 0 && celulas[indice] !== undefined) bruto[campo] = celulas[indice];
  }
  return bruto;
}
