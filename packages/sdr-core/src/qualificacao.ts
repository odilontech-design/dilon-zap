import { LIMITES } from "./limites";
import { comparavel, type EmpresaNormalizada } from "./normalizacao";

/**
 * Qualificação por regras, sem IA e sem consulta externa. Só usa o que o CSV
 * trouxe. O que o arquivo não permite conferir aparece como DESCONHECIDO ou
 * NAO_VERIFICADO, nunca como atendido: a pontuação é só sobre o que foi avaliado.
 */

export type SituacaoCriterio = "ATENDIDO" | "NAO_ATENDIDO" | "DESCONHECIDO" | "NAO_VERIFICADO";

export type CriterioAvaliado = {
  chave: string;
  nome: string;
  tipo: "estrutural" | "personalizado";
  peso: number;
  obrigatorio: boolean;
  situacao: SituacaoCriterio;
  justificativa: string;
};

export type PerfilParaQualificar = {
  segmentos: string[];
  cnaes: string[];
  ufs: string[];
  cidades: string[];
  portes: string[];
  criterios: { nome: string; descricao?: string; peso: number; obrigatorio: boolean }[];
};

/** Porte vem como texto do banco; o que não for um porte conhecido é tratado como não informado. */
export type EmpresaParaQualificar = Pick<EmpresaNormalizada, "uf" | "cidade" | "cnae" | "segmento"> & { porte: string | null };

export type StatusQualificacao = "QUALIFICADO" | "NAO_QUALIFICADO" | "VERIFICAR";

export type ResultadoQualificacao = {
  status: StatusQualificacao;
  pontuacao: number | null;
  cobertura: number;
  criterios: CriterioAvaliado[];
};

/** Peso de cada critério estrutural e se ele elimina quando não atendido. */
const ESTRUTURAIS = {
  cnae: { peso: 5, obrigatorio: true, nome: "CNAE" },
  uf: { peso: 3, obrigatorio: true, nome: "Estado" },
  cidade: { peso: 3, obrigatorio: true, nome: "Cidade" },
  porte: { peso: 3, obrigatorio: true, nome: "Porte" },
  // Texto livre dos dois lados: serve para ponderar, não para eliminar.
  segmento: { peso: 4, obrigatorio: false, nome: "Segmento" },
} as const;

const ROTULO_PORTE: Record<string, string> = { MEI: "MEI", ME: "Microempresa", EPP: "Pequeno porte", MEDIA: "Média", GRANDE: "Grande" };

/** Segmento casa se cada palavra do perfil tem uma palavra de mesmo começo no segmento da empresa (clinicas ~ clinica). */
export function segmentoCasa(segmentoDaEmpresa: string, segmentoDoPerfil: string): boolean {
  const palavras = (s: string) => comparavel(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((p) => p.length >= 3);
  const daEmpresa = palavras(segmentoDaEmpresa);
  const doPerfil = palavras(segmentoDoPerfil);
  if (doPerfil.length === 0 || daEmpresa.length === 0) return false;
  return doPerfil.every((p) => daEmpresa.some((e) => e.startsWith(p) || p.startsWith(e)));
}

export function qualificar(empresa: EmpresaParaQualificar, perfil: PerfilParaQualificar): ResultadoQualificacao {
  const criterios: CriterioAvaliado[] = [];

  const estrutural = (
    chave: keyof typeof ESTRUTURAIS,
    desejados: string[],
    valor: string | null,
    comparar: (v: string, d: string) => boolean,
    exibir: (v: string) => string = (v) => v
  ) => {
    if (desejados.length === 0) return;
    const { peso, obrigatorio, nome } = ESTRUTURAIS[chave];
    const base = { chave, nome, tipo: "estrutural" as const, peso, obrigatorio };
    if (!valor) {
      criterios.push({ ...base, situacao: "DESCONHECIDO", justificativa: `${nome} não informado no CSV, não dá para conferir` });
    } else if (desejados.some((d) => comparar(valor, d))) {
      criterios.push({ ...base, situacao: "ATENDIDO", justificativa: `${nome} ${exibir(valor)} está entre os do perfil (informado no CSV)` });
    } else {
      criterios.push({ ...base, situacao: "NAO_ATENDIDO", justificativa: `${nome} ${exibir(valor)} não está entre os do perfil (informado no CSV)` });
    }
  };

  const igual = (a: string, b: string) => comparavel(a) === comparavel(b);
  estrutural("cnae", perfil.cnaes, empresa.cnae, (v, d) => v === d.replace(/\D/g, ""));
  estrutural("uf", perfil.ufs, empresa.uf, igual);
  estrutural("cidade", perfil.cidades, empresa.cidade, igual);
  estrutural("porte", perfil.portes, empresa.porte, (v, d) => v === d, (v) => ROTULO_PORTE[v] ?? v);
  estrutural("segmento", perfil.segmentos, empresa.segmento, segmentoCasa);

  perfil.criterios.forEach((c, i) => {
    criterios.push({
      chave: `personalizado:${i}`,
      nome: c.nome,
      tipo: "personalizado",
      peso: c.peso,
      obrigatorio: c.obrigatorio,
      situacao: "NAO_VERIFICADO",
      justificativa: "Critério livre do perfil: o CSV não permite conferir e nada foi pesquisado",
    });
  });

  const avaliados = criterios.filter((c) => c.situacao === "ATENDIDO" || c.situacao === "NAO_ATENDIDO");
  const pesoTotal = criterios.reduce((s, c) => s + c.peso, 0);
  const pesoAvaliado = avaliados.reduce((s, c) => s + c.peso, 0);
  const pesoAtendido = avaliados.filter((c) => c.situacao === "ATENDIDO").reduce((s, c) => s + c.peso, 0);
  const pontuacao = pesoAvaliado > 0 ? Math.round((100 * pesoAtendido) / pesoAvaliado) : null;
  const cobertura = pesoTotal > 0 ? Math.round((100 * pesoAvaliado) / pesoTotal) : 0;

  const obrigatorios = criterios.filter((c) => c.obrigatorio);
  let status: StatusQualificacao;
  if (obrigatorios.some((c) => c.situacao === "NAO_ATENDIDO")) status = "NAO_QUALIFICADO";
  else if (obrigatorios.some((c) => c.situacao === "DESCONHECIDO" || c.situacao === "NAO_VERIFICADO")) status = "VERIFICAR";
  else if (pontuacao === null) status = "VERIFICAR";
  else status = pontuacao >= LIMITES.limiarDeQualificacao ? "QUALIFICADO" : "NAO_QUALIFICADO";

  return { status, pontuacao, cobertura, criterios };
}
