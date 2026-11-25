/**
 * O estágio de um lead de portal, deduzido do que já aconteceu — ninguém precisa arrastar cartão nem clicar. Puro,
 * sem banco: quem consulta o banco (painel-leads.ts) só monta os sinais e chama estagioDoLead.
 *
 * Os sinais vêm da própria conversa: a loja respondeu (pessoa ou Vendedor IA), o cliente respondeu, a IA passou para
 * a equipe (e por quê), há ficha de financiamento, a negociação foi ganha ou perdida. Mensagem automática (menu,
 * saudação) não conta como resposta.
 *
 * Estágios, do início ao fim do funil:
 *   NOVO         chegou e ninguém falou com ele (nem ele com a loja)
 *   ABORDADO     a loja respondeu; o cliente ainda não
 *   EM_CONVERSA  o cliente escreveu (antes ou depois da resposta da loja)
 *   VISITA       a IA identificou que ele quer visitar / test drive
 *   NEGOCIACAO   quer negociar, financiar, trocar, ou pediu uma pessoa; ou há ficha de financiamento
 *   ESFRIOU      a loja falou por último e o cliente sumiu há dias
 *   GANHO / PERDIDO   a negociação foi fechada
 *
 * Além do estágio, o lead pode "precisar de gente": é o que a automação não resolve e uma pessoa tem que ver agora.
 */

export type Estagio = "NOVO" | "ABORDADO" | "EM_CONVERSA" | "VISITA" | "NEGOCIACAO" | "ESFRIOU" | "GANHO" | "PERDIDO";

export const ESTAGIOS: { estagio: Estagio; rotulo: string; descricao: string }[] = [
  { estagio: "NOVO", rotulo: "Novo", descricao: "Chegou e ainda não foi respondido" },
  { estagio: "ABORDADO", rotulo: "Respondido", descricao: "A loja respondeu; o cliente ainda não" },
  { estagio: "EM_CONVERSA", rotulo: "Em conversa", descricao: "O cliente respondeu" },
  { estagio: "VISITA", rotulo: "Quer visitar", descricao: "Pediu visita ou test drive" },
  { estagio: "NEGOCIACAO", rotulo: "Negociando", descricao: "Quer negociar, financiar, trocar ou falar com uma pessoa" },
  { estagio: "ESFRIOU", rotulo: "Esfriou", descricao: "A loja falou por último e o cliente sumiu" },
  { estagio: "GANHO", rotulo: "Venda fechada", descricao: "Negociação ganha" },
  { estagio: "PERDIDO", rotulo: "Perdido", descricao: "Negociação perdida" },
];

export function rotuloDoEstagio(e: Estagio): string {
  return ESTAGIOS.find((x) => x.estagio === e)!.rotulo;
}

/** Quanto tempo de silêncio do cliente (com a loja tendo falado por último) faz o lead "esfriar". */
export const DIAS_PARA_ESFRIAR = 3;
/** Cliente esperando resposta há mais que isso entra em "precisa de gente" (a mesma régua do tempo de resposta). */
export const MINUTOS_PARA_ATENDER = 15;

const MIN_MS = 60_000;
const DIA_MS = 86_400_000;

export type AutorDaMensagem = "cliente" | "pessoa" | "ia" | "automatica";

/** Quem escreveu: o cliente, uma pessoa da loja (Inbox ou celular), o Vendedor IA, ou uma automação (menu, saudação). */
export function autorDaMensagem(m: { direction: string; senderUserId?: string | null; deCelular?: boolean | null; referenciaExterna?: string | null }): AutorDaMensagem {
  if (m.direction === "INBOUND") return "cliente";
  if (m.senderUserId || m.deCelular) return "pessoa";
  if (m.referenciaExterna?.startsWith("vendedor-ia:")) return "ia";
  return "automatica";
}

/**
 * O que a IA registrou ao passar a conversa para a equipe (o rótulo do motivo): visita, algo que pede negociação, ou
 * nada que diga o estágio ("assumida por Fulano", "a IA ficou indisponível", "outro assunto"...).
 */
export function tipoDoMotivoDaIa(motivo: string | null | undefined): "visita" | "negociar" | null {
  const m = (motivo ?? "").toLowerCase();
  if (m.includes("visita") || m.includes("test drive")) return "visita";
  if (m.includes("negocia") || m.includes("financ") || m.includes("troca") || m.includes("pedido do cliente")) return "negociar";
  return null;
}

export type MensagemDoLead = { de: AutorDaMensagem; em: Date };

export type SinaisDoLead = {
  recebidoEm: Date;
  /** "Já respondi" (ligação, por exemplo). */
  respondidoManualEm: Date | null;
  /** As mensagens da conversa do contato, a partir do momento em que o lead chegou. */
  mensagens: MensagemDoLead[];
  statusNegociacao: "ABERTA" | "GANHA" | "PERDIDA" | null;
  /** A IA passou a conversa para a equipe: quando e o que ela identificou. */
  iaPassouEm: Date | null;
  iaPassouTipo: "visita" | "negociar" | null;
  temFichaFinanciamento: boolean;
};

export type MotivoDeAtencao = "sem_resposta" | "cliente_esperando" | "ia_passou";

export type Situacao = {
  estagio: Estagio;
  /** Primeira vez que a loja falou com o lead (pessoa, IA ou "já respondi"). */
  respostaEm: Date | null;
  /** O cliente escreveu depois que o lead chegou. */
  clienteEscreveu: boolean;
  /** Mostrou intenção clara: quer visitar, negociar ou financiar. */
  querAvancar: boolean;
  ultimaAtividadeEm: Date;
  precisaDeGente: { motivo: MotivoDeAtencao; desde: Date } | null;
};

export function estagioDoLead(s: SinaisDoLead, agora: Date): Situacao {
  const msgs = s.mensagens.filter((m) => m.em >= s.recebidoEm).sort((a, b) => a.em.getTime() - b.em.getTime());
  const respostasDaLoja = msgs.filter((m) => m.de === "pessoa" || m.de === "ia").map((m) => m.em);
  const candidatas = [s.respondidoManualEm, respostasDaLoja[0] ?? null].filter((d): d is Date => !!d && d >= s.recebidoEm);
  const respostaEm = candidatas.length ? new Date(Math.min(...candidatas.map((d) => d.getTime()))) : null;

  const doCliente = msgs.filter((m) => m.de === "cliente");
  const clienteEscreveu = doCliente.length > 0;
  const ultimaDoCliente = doCliente.length ? doCliente[doCliente.length - 1].em : null;
  const ultimaDaLoja = respostasDaLoja.length ? respostasDaLoja[respostasDaLoja.length - 1] : s.respondidoManualEm;
  const ultimaAtividadeEm = new Date(Math.max(s.recebidoEm.getTime(), ...msgs.map((m) => m.em.getTime()), s.respondidoManualEm?.getTime() ?? 0));

  const querAvancar = s.iaPassouTipo !== null || s.temFichaFinanciamento;
  const base = { respostaEm, clienteEscreveu, querAvancar, ultimaAtividadeEm };

  if (s.statusNegociacao === "GANHA") return { ...base, estagio: "GANHO", precisaDeGente: null };
  if (s.statusNegociacao === "PERDIDA") return { ...base, estagio: "PERDIDO", precisaDeGente: null };

  // Quem precisa de gente: o que a automação não resolve. Mais quente primeiro.
  let precisaDeGente: Situacao["precisaDeGente"] = null;
  const esperaMin = (desde: Date) => (agora.getTime() - desde.getTime()) / MIN_MS;
  const passouSemPessoa = s.iaPassouTipo !== null && !msgs.some((m) => m.de === "pessoa" && (!s.iaPassouEm || m.em >= s.iaPassouEm)) && !(s.respondidoManualEm && (!s.iaPassouEm || s.respondidoManualEm >= s.iaPassouEm));
  const clienteEsperando = ultimaDoCliente !== null && !respostasDaLoja.some((d) => d.getTime() > ultimaDoCliente.getTime()) && !(s.respondidoManualEm && s.respondidoManualEm > ultimaDoCliente);

  if (passouSemPessoa) precisaDeGente = { motivo: "ia_passou", desde: s.iaPassouEm ?? ultimaAtividadeEm };
  else if (clienteEsperando && ultimaDoCliente && esperaMin(ultimaDoCliente) > MINUTOS_PARA_ATENDER) precisaDeGente = { motivo: "cliente_esperando", desde: ultimaDoCliente };
  else if (respostaEm === null && !clienteEscreveu && esperaMin(s.recebidoEm) > MINUTOS_PARA_ATENDER) precisaDeGente = { motivo: "sem_resposta", desde: s.recebidoEm };

  if (respostaEm === null && !clienteEscreveu) return { ...base, estagio: "NOVO", precisaDeGente };
  if (s.iaPassouTipo === "visita") return { ...base, estagio: "VISITA", precisaDeGente };
  if (querAvancar) return { ...base, estagio: "NEGOCIACAO", precisaDeGente };

  // A loja falou por último e o cliente sumiu: esfriou. Se o cliente é quem está esperando, o lead está quente.
  const ultimaFalaEhDaLoja = ultimaDaLoja !== null && (ultimaDoCliente === null || ultimaDaLoja > ultimaDoCliente);
  if (ultimaFalaEhDaLoja && agora.getTime() - ultimaAtividadeEm.getTime() > DIAS_PARA_ESFRIAR * DIA_MS) return { ...base, estagio: "ESFRIOU", precisaDeGente };

  return { ...base, estagio: clienteEscreveu ? "EM_CONVERSA" : "ABORDADO", precisaDeGente };
}

/** Do mais quente ao menos quente: o cliente que a IA passou para a equipe vem antes de quem só está sem resposta. */
export const ORDEM_DA_ATENCAO: Record<MotivoDeAtencao, number> = { ia_passou: 0, cliente_esperando: 1, sem_resposta: 2 };

export function textoDaAtencao(motivo: MotivoDeAtencao, estagio: Estagio): string {
  if (motivo === "ia_passou") return estagio === "VISITA" ? "A IA passou: quer visitar" : "A IA passou: quer negociar";
  if (motivo === "cliente_esperando") return "Cliente esperando resposta";
  return "Sem resposta";
}
