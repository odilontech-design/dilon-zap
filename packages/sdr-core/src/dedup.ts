import { comparavel, type EmpresaNormalizada } from "./normalizacao";

/**
 * Deduplicação. O CNPJ manda. Sem ele (ou sem achar por ele), valem o site e,
 * por último, o nome com o mesmo estado (e a mesma cidade, se as duas
 * empresas tiverem cidade). Dois CNPJs diferentes nunca são a mesma empresa,
 * mesmo com o mesmo site ou nome: matriz e filial têm CNPJ próprio.
 */

export type EmpresaConhecida = {
  id: string;
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  dominio: string | null;
  emailDominio: string | null;
  uf: string | null;
  cidade: string | null;
  segmento: string | null;
  porte: string | null;
  cnae: string | null;
  chaveNome: string;
  /** Importação que criou a empresa, para dizer se a duplicata é do próprio arquivo. */
  importacaoOrigemId: string | null;
};

export type CriterioDeDuplicidade = "CNPJ" | "SITE" | "NOME_UF";
export type Achado = { empresa: EmpresaConhecida; por: CriterioDeDuplicidade };

/** Põe na lista da chave; se a empresa já está lá (mesmo id), troca pelo estado novo. */
const empurrar = (mapa: Map<string, EmpresaConhecida[]>, chave: string, valor: EmpresaConhecida) => {
  const lista = mapa.get(chave);
  if (!lista) return void mapa.set(chave, [valor]);
  const i = lista.findIndex((e) => e.id === valor.id);
  if (i >= 0) lista[i] = valor;
  else lista.push(valor);
};

export class IndiceDeEmpresas {
  private porCnpj = new Map<string, EmpresaConhecida>();
  private porDominio = new Map<string, EmpresaConhecida[]>();
  private porNome = new Map<string, EmpresaConhecida[]>();

  constructor(empresas: EmpresaConhecida[] = []) {
    for (const e of empresas) this.adicionar(e);
  }

  adicionar(e: EmpresaConhecida) {
    if (e.cnpj) this.porCnpj.set(e.cnpj, e);
    if (e.dominio) empurrar(this.porDominio, e.dominio, e);
    if (e.chaveNome) empurrar(this.porNome, e.chaveNome, e);
  }

  /** Atualiza o índice depois de a empresa receber campos novos (CNPJ, site). */
  reindexar(e: EmpresaConhecida) {
    this.adicionar(e);
  }

  achar(n: Pick<EmpresaNormalizada, "cnpj" | "dominio" | "chaveNome" | "uf" | "cidade">): Achado | null {
    if (n.cnpj) {
      const pelaCnpj = this.porCnpj.get(n.cnpj);
      if (pelaCnpj) return { empresa: pelaCnpj, por: "CNPJ" };
    }
    // Só a mesma empresa se não houver CNPJ diferente dos dois lados.
    const compativel = (c: EmpresaConhecida) => !(n.cnpj && c.cnpj && n.cnpj !== c.cnpj);

    if (n.dominio) {
      const c = this.porDominio.get(n.dominio)?.find(compativel);
      if (c) return { empresa: c, por: "SITE" };
    }
    if (n.chaveNome && n.uf) {
      const c = this.porNome
        .get(n.chaveNome)
        ?.find((c) => compativel(c) && c.uf === n.uf && (!n.cidade || !c.cidade || comparavel(n.cidade) === comparavel(c.cidade)));
      if (c) return { empresa: c, por: "NOME_UF" };
    }
    return null;
  }
}

/** Campos que a mesclagem pode preencher. */
const CAMPOS_MESCLAVEIS = ["cnpj", "razaoSocial", "nomeFantasia", "telefone", "email", "site", "uf", "cidade", "segmento", "porte", "cnae"] as const;
type CampoMesclavel = (typeof CAMPOS_MESCLAVEIS)[number];

export type Mudanca = { campo: string; de: null; para: string };
export type Conflito = { campo: string; existente: string; arquivo: string };

export type Mesclagem = {
  mudancas: Mudanca[];
  conflitos: Conflito[];
  /** O que gravar na empresa. Só campos que estavam vazios. */
  atualizacao: Partial<Record<CampoMesclavel | "dominio" | "emailDominio", string>>;
};

const igual = (a: string, b: string) => comparavel(a) === comparavel(b);

/**
 * A regra explícita de mesclagem: campo vazio na empresa recebe o valor do
 * arquivo; campo preenchido NUNCA é sobrescrito, e a divergência fica
 * registrada como conflito para alguém olhar. Nada é apagado.
 */
export function mesclarPreenchendoVazios(existente: EmpresaConhecida, novo: EmpresaNormalizada): Mesclagem {
  const mudancas: Mudanca[] = [];
  const conflitos: Conflito[] = [];
  const atualizacao: Mesclagem["atualizacao"] = {};

  for (const campo of CAMPOS_MESCLAVEIS) {
    const valorNovo = novo[campo] as string | null;
    if (!valorNovo) continue;
    const valorAtual = existente[campo] as string | null;
    if (!valorAtual) {
      mudancas.push({ campo, de: null, para: valorNovo });
      atualizacao[campo] = valorNovo;
      if (campo === "site" && novo.dominio && !existente.dominio) atualizacao.dominio = novo.dominio;
      if (campo === "email" && novo.emailDominio && !existente.emailDominio) atualizacao.emailDominio = novo.emailDominio;
    } else if (!igual(valorAtual, valorNovo)) {
      conflitos.push({ campo, existente: valorAtual, arquivo: valorNovo });
    }
  }
  return { mudancas, conflitos, atualizacao };
}
