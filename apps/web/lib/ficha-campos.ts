/**
 * Os campos da ficha de financiamento (como a do AutoCerto), usados pelo formulário do site,
 * pela conferência no servidor e pela tela que mostra a ficha na negociação. Sem imports de
 * servidor: o formulário público também usa este arquivo.
 */

export type TipoDeCampo = "texto" | "email" | "cpf" | "telefone" | "data" | "dinheiro" | "cep" | "uf" | "escolha";
export type Campo = { chave: string; rotulo: string; tipo: TipoDeCampo; obrigatorio?: boolean; opcoes?: string[]; dica?: string; largo?: boolean };

export type ConfigFicha = {
  /** Ficha completa (CPF, renda, referências…) ou o formulário curto (nome, WhatsApp, carro e entrada). */
  completa: boolean;
  endereco: boolean;
  profissional: boolean;
  conjuge: boolean;
  refPessoais: number; // 0 a 3
  refBancarias: number; // 0 a 2
  veiculo: boolean;
};

export const FICHA_PADRAO: ConfigFicha = { completa: false, endereco: true, profissional: true, conjuge: false, refPessoais: 1, refBancarias: 1, veiculo: true };

export function configDaFicha(json: unknown): ConfigFicha {
  const j = (json && typeof json === "object" ? json : {}) as Partial<ConfigFicha>;
  const bool = (v: unknown, p: boolean) => (typeof v === "boolean" ? v : p);
  const num = (v: unknown, p: number, max: number) => (typeof v === "number" && Number.isInteger(v) ? Math.min(Math.max(v, 0), max) : p);
  return {
    completa: bool(j.completa, FICHA_PADRAO.completa),
    endereco: bool(j.endereco, FICHA_PADRAO.endereco),
    profissional: bool(j.profissional, FICHA_PADRAO.profissional),
    conjuge: bool(j.conjuge, FICHA_PADRAO.conjuge),
    refPessoais: num(j.refPessoais, FICHA_PADRAO.refPessoais, 3),
    refBancarias: num(j.refBancarias, FICHA_PADRAO.refBancarias, 2),
    veiculo: bool(j.veiculo, FICHA_PADRAO.veiculo),
  };
}

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export const CAMPOS = {
  pessoais: [
    { chave: "nome", rotulo: "Nome completo", tipo: "texto", obrigatorio: true, largo: true },
    { chave: "cpf", rotulo: "CPF", tipo: "cpf", obrigatorio: true },
    { chave: "nascimento", rotulo: "Data de nascimento", tipo: "data", obrigatorio: true },
    { chave: "telefone", rotulo: "WhatsApp", tipo: "telefone", obrigatorio: true },
    { chave: "celular", rotulo: "Outro telefone", tipo: "telefone" },
    { chave: "email", rotulo: "E-mail", tipo: "email" },
    { chave: "estadoCivil", rotulo: "Estado civil", tipo: "escolha", opcoes: ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"] },
    { chave: "cnh", rotulo: "Número da CNH", tipo: "texto" },
  ],
  endereco: [
    { chave: "cep", rotulo: "CEP", tipo: "cep", obrigatorio: true },
    { chave: "logradouro", rotulo: "Rua / avenida", tipo: "texto", obrigatorio: true, largo: true },
    { chave: "numero", rotulo: "Número", tipo: "texto", obrigatorio: true },
    { chave: "complemento", rotulo: "Complemento", tipo: "texto" },
    { chave: "bairro", rotulo: "Bairro", tipo: "texto", obrigatorio: true },
    { chave: "cidade", rotulo: "Cidade", tipo: "texto", obrigatorio: true },
    { chave: "uf", rotulo: "Estado", tipo: "uf", obrigatorio: true, opcoes: UFS },
    { chave: "tempoResidencia", rotulo: "Mora lá há quanto tempo?", tipo: "texto", dica: "ex.: 3 anos" },
    { chave: "tipoResidencia", rotulo: "A residência é", tipo: "escolha", opcoes: ["Própria", "Alugada", "Financiada", "Com os pais / família", "Outra"] },
  ],
  profissional: [
    { chave: "empresa", rotulo: "Empresa onde trabalha", tipo: "texto", obrigatorio: true, largo: true },
    { chave: "cargo", rotulo: "Cargo", tipo: "texto" },
    { chave: "setor", rotulo: "Setor", tipo: "texto" },
    { chave: "admissao", rotulo: "Data de admissão", tipo: "data" },
    { chave: "telefoneEmpresa", rotulo: "Telefone da empresa", tipo: "telefone" },
    { chave: "enderecoEmpresa", rotulo: "Endereço da empresa", tipo: "texto", largo: true },
    { chave: "salario", rotulo: "Salário (R$)", tipo: "dinheiro", obrigatorio: true },
    { chave: "outrasRendas", rotulo: "Outras rendas (R$)", tipo: "dinheiro" },
  ],
  conjuge: [
    { chave: "nome", rotulo: "Nome do cônjuge", tipo: "texto", obrigatorio: true, largo: true },
    { chave: "cpf", rotulo: "CPF", tipo: "cpf", obrigatorio: true },
    { chave: "rg", rotulo: "RG", tipo: "texto" },
    { chave: "nascimento", rotulo: "Data de nascimento", tipo: "data" },
    { chave: "telefone", rotulo: "Telefone", tipo: "telefone" },
    { chave: "empresa", rotulo: "Empresa", tipo: "texto" },
    { chave: "cargo", rotulo: "Cargo", tipo: "texto" },
    { chave: "admissao", rotulo: "Data de admissão", tipo: "data" },
    { chave: "renda", rotulo: "Renda (R$)", tipo: "dinheiro" },
  ],
  refPessoal: [
    { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
    { chave: "telefone", rotulo: "Telefone", tipo: "telefone", obrigatorio: true },
    { chave: "endereco", rotulo: "Endereço", tipo: "texto", largo: true },
  ],
  refBancaria: [
    { chave: "banco", rotulo: "Banco", tipo: "texto", obrigatorio: true },
    { chave: "agencia", rotulo: "Agência", tipo: "texto", obrigatorio: true },
    { chave: "conta", rotulo: "Conta", tipo: "texto", obrigatorio: true },
    { chave: "clienteDesde", rotulo: "Cliente desde", tipo: "texto", dica: "mês/ano" },
  ],
  veiculo: [
    { chave: "entrada", rotulo: "Valor de entrada (R$)", tipo: "dinheiro" },
    { chave: "valorFinanciar", rotulo: "Valor a financiar (R$)", tipo: "dinheiro" },
    { chave: "parcelas", rotulo: "Número de parcelas", tipo: "escolha", opcoes: ["12", "18", "24", "36", "48", "60"] },
    { chave: "carroDesejado", rotulo: "Carro desejado (se não está na lista)", tipo: "texto", largo: true },
  ],
} satisfies Record<string, Campo[]>;

export const TITULOS = {
  pessoais: "Dados pessoais",
  endereco: "Endereço",
  profissional: "Dados profissionais",
  conjuge: "Cônjuge",
  refPessoais: "Referências pessoais",
  refBancarias: "Referências bancárias",
  veiculo: "Veículo e financiamento",
} as const;

type Grupo = Record<string, string>;
export type DadosDaFicha = {
  pessoais: Grupo;
  endereco?: Grupo;
  profissional?: Grupo;
  conjuge?: Grupo;
  refPessoais?: Grupo[];
  refBancarias?: Grupo[];
  veiculo?: Grupo & { veiculoId?: string };
};

export function cpfValido(entrada: string): boolean {
  const d = entrada.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** As seções que esta configuração pede, na ordem da ficha. */
export function secoesDaConfig(c: ConfigFicha): (keyof typeof TITULOS)[] {
  return (["pessoais", "endereco", "profissional", "conjuge", "refPessoais", "refBancarias", "veiculo"] as const).filter((s) =>
    s === "pessoais" ? true : s === "refPessoais" ? c.refPessoais > 0 : s === "refBancarias" ? c.refBancarias > 0 : c[s]
  );
}

function conferirGrupo(campos: Campo[], g: unknown, onde: string): { grupo: Grupo } | { erro: string } {
  const entrada = (g && typeof g === "object" ? g : {}) as Record<string, unknown>;
  const grupo: Grupo = {};
  for (const c of campos) {
    const bruto = entrada[c.chave];
    const v = typeof bruto === "string" ? bruto.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    if (!v) {
      if (c.obrigatorio) return { erro: `${onde}: preencha ${c.rotulo.toLowerCase()}` };
      continue;
    }
    if (c.tipo === "cpf" && !cpfValido(v)) return { erro: `${onde}: CPF inválido` };
    if (c.tipo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { erro: `${onde}: e-mail inválido` };
    if (c.tipo === "telefone" && !/^\d{10,13}$/.test(v.replace(/\D/g, ""))) return { erro: `${onde}: ${c.rotulo.toLowerCase()} precisa ter DDD` };
    if (c.tipo === "cep" && v.replace(/\D/g, "").length !== 8) return { erro: `${onde}: CEP precisa ter 8 dígitos` };
    if (c.tipo === "data" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { erro: `${onde}: ${c.rotulo.toLowerCase()} inválida` };
    if ((c.tipo === "escolha" || c.tipo === "uf") && c.opcoes && !c.opcoes.includes(v)) return { erro: `${onde}: ${c.rotulo.toLowerCase()} inválido` };
    grupo[c.chave] = v;
  }
  return { grupo };
}

/** Confere a ficha enviada contra a configuração da loja: só fica o que a loja pediu, e o obrigatório tem que vir. */
export function conferirFicha(c: ConfigFicha, entrada: unknown): { ok: true; dados: DadosDaFicha; secoes: string[] } | { ok: false; erro: string } {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const dados: DadosDaFicha = { pessoais: {} };
  for (const s of secoesDaConfig(c)) {
    if (s === "refPessoais" || s === "refBancarias") {
      const n = s === "refPessoais" ? c.refPessoais : c.refBancarias;
      const lista = Array.isArray(e[s]) ? (e[s] as unknown[]) : [];
      const grupos: Grupo[] = [];
      for (let i = 0; i < n; i++) {
        const r = conferirGrupo(s === "refPessoais" ? CAMPOS.refPessoal : CAMPOS.refBancaria, lista[i], `${TITULOS[s]} ${i + 1}`);
        if ("erro" in r) return { ok: false, erro: r.erro };
        grupos.push(r.grupo);
      }
      dados[s] = grupos;
      continue;
    }
    const r = conferirGrupo(CAMPOS[s], e[s], TITULOS[s]);
    if ("erro" in r) return { ok: false, erro: r.erro };
    if (s === "veiculo") {
      const id = (e.veiculo as Record<string, unknown> | undefined)?.veiculoId;
      dados.veiculo = { ...r.grupo, ...(typeof id === "string" && id.length <= 40 && id ? { veiculoId: id } : {}) };
    } else dados[s] = r.grupo;
  }
  return { ok: true, dados, secoes: secoesDaConfig(c) };
}

/** "R$ 4.500,00" ou "4500" vira centavos; lixo vira nulo. */
export function dinheiroEmCentavos(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}
