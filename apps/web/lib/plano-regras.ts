/**
 * O que cada plano inclui. Puro, sem banco — é a tabela comercial da Dilon
 * Tech em forma de código, e por isso tem teste próprio.
 *
 * A escada dos planos NOVOS:
 *
 *   Essencial     — atender:            inbox, contatos, funil, automações, relatórios
 *   Profissional  — organizar e vender: + menu de triagem, setores, pedidos, a receber
 *   Escala        — integrar:           + porta de integração com outros sistemas
 *
 * Quem contratou antes desta tabela tem `plataformaCompleta` e recebe tudo,
 * independente do plano. É promessa por escrito — no site e na proposta da
 * Hemoderi — e esta tabela não tem autoridade pra desfazê-la.
 */

export type Plano = "ESSENCIAL" | "PROFISSIONAL" | "ESCALA";
export type Recurso = "URA" | "SETORES" | "PEDIDOS" | "CONTAS_RECEBER" | "INTEGRACAO_API";

export const TODOS_RECURSOS: Recurso[] = ["URA", "SETORES", "PEDIDOS", "CONTAS_RECEBER", "INTEGRACAO_API"];

export const PLANOS: Record<
  Plano,
  { nome: string; maxAtendentes: number | null; recursos: Recurso[]; resumo: string }
> = {
  ESSENCIAL: {
    nome: "Essencial",
    maxAtendentes: 3,
    recursos: [],
    resumo: "Atender: inbox, contatos, funil, automações e relatórios.",
  },
  PROFISSIONAL: {
    nome: "Profissional",
    maxAtendentes: 8,
    // Menu de triagem e setores andam juntos: triagem existe pra encaminhar a
    // um setor, e setor faz sentido a partir do tamanho de equipe deste plano.
    recursos: ["URA", "SETORES", "PEDIDOS", "CONTAS_RECEBER"],
    resumo: "Organizar e vender: triagem, setores, pedidos, estoque e contas a receber.",
  },
  ESCALA: {
    nome: "Escala",
    maxAtendentes: null, // ilimitado
    recursos: TODOS_RECURSOS,
    resumo: "Integrar: tudo do Profissional e a porta de integração com outros sistemas.",
  },
};

export const ROTULO_RECURSO: Record<Recurso, string> = {
  URA: "Menu de triagem",
  SETORES: "Setores",
  PEDIDOS: "Pedidos, produtos e estoque",
  CONTAS_RECEBER: "Contas a receber",
  INTEGRACAO_API: "Integração com outros sistemas",
};

export type Assinatura = {
  plano: Plano;
  plataformaCompleta: boolean;
} | null;

export type Excecao = { recurso: Recurso; ativo: boolean };

/**
 * Os recursos que valem de fato para uma empresa.
 *
 * Três camadas, nesta ordem:
 *   1. Sem assinatura, ou cliente da regra antiga → tudo.
 *   2. Senão, o que o plano inclui.
 *   3. Exceções por cima, ligando ou desligando um recurso só pra esta empresa.
 *
 * "Sem assinatura = tudo" é deliberado, e não um descuido. Depois desta
 * mudança toda empresa nova nasce com assinatura (em teste), então as únicas
 * que ficam sem são as que já existiam — e essas são justamente as da regra
 * antiga. Falhar pro lado fechado bloquearia de uma vez a Hemoderi, a Sales e
 * a Vai Viajar, que nunca tiveram assinatura cadastrada.
 */
export function recursosEfetivos(assinatura: Assinatura, excecoes: Excecao[]): Set<Recurso> {
  const base: Recurso[] =
    !assinatura || assinatura.plataformaCompleta ? TODOS_RECURSOS : PLANOS[assinatura.plano].recursos;

  const efetivos = new Set<Recurso>(base);
  for (const e of excecoes) {
    if (e.ativo) efetivos.add(e.recurso);
    else efetivos.delete(e.recurso);
  }
  return efetivos;
}

/**
 * Teto de atendentes ativos, ou null se ilimitado.
 *
 * Cliente da regra antiga NÃO ganha atendente ilimitado: a promessa antiga era
 * "todos os planos têm a plataforma completa", e plataforma é software — o
 * número de atendentes sempre foi o que diferenciava os planos, inclusive no
 * site. Então o limite vale pra todo mundo, pelo plano cadastrado.
 */
export function limiteDeAtendentes(assinatura: Assinatura): number | null {
  if (!assinatura) return null; // legado sem cadastro: não trava quem já opera
  return PLANOS[assinatura.plano].maxAtendentes;
}
