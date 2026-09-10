/**
 * As contas que uma empresa SaaS olha todo dia. Puro, sem banco.
 *
 * Cinco perguntas: quanto entra por mês, quem está em teste e quando vence,
 * quem está devendo, quem entrou e não está usando, e quem saiu. O painel da
 * Dilon Tech não respondia nenhuma de relance — só descobri que três clientes
 * nunca conectaram o número porque fui olhar no banco.
 */

export const DIAS_DE_TESTE = 14;

export type SituacaoCobranca = "TRIAL" | "ACTIVE" | "PAUSED" | "CANCELED" | "SEM_ASSINATURA";

export type ClienteSaas = {
  id: string;
  nome: string;
  criadoEm: Date;
  situacao: SituacaoCobranca;
  mensalCents: number | null;
  testeAte: Date | null;
  whatsappConectado: boolean;
  ultimaMensagemEm: Date | null;
  usuariosAtivos: number;
  faturasVencidas: number;
};

/**
 * Receita recorrente mensal: soma do que paga, e só do que paga.
 *
 * Teste não entra: é receita prometida, não recebida, e somar inflaria o
 * número justamente nos meses em que mais gente está testando. Pausado também
 * não entra — por definição não está pagando agora.
 */
export function mrr(clientes: ClienteSaas[]) {
  return clientes
    .filter((c) => c.situacao === "ACTIVE" && c.mensalCents)
    .reduce((s, c) => s + (c.mensalCents ?? 0), 0);
}

/** Quantos dias faltam pro teste acabar. Negativo = já acabou. */
export function diasRestantesDeTeste(testeAte: Date, agora = new Date()) {
  const dia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((dia(testeAte) - dia(agora)) / 86_400_000);
}

export type Ativacao = "ativo" | "esfriando" | "parado" | "nunca_ativou";

/**
 * O quanto a empresa está de fato usando o sistema.
 *
 * É a peça de maior retorno do painel. Cliente que paga e não usa é o que
 * cancela no segundo mês — e ver isso a tempo é o que dá chance de ligar pra
 * ele antes, em vez de descobrir no dia do cancelamento.
 *
 * "Nunca ativou" vem primeiro de propósito: WhatsApp não conectado é o
 * bloqueio mais comum e o mais fácil de resolver, porque é uma ligação de dez
 * minutos pra ler um QR Code.
 */
export function ativacao(c: ClienteSaas, agora = new Date()): Ativacao {
  if (!c.whatsappConectado && !c.ultimaMensagemEm) return "nunca_ativou";
  if (!c.ultimaMensagemEm) return "nunca_ativou";

  const dias = (agora.getTime() - c.ultimaMensagemEm.getTime()) / 86_400_000;
  if (dias <= 3) return "ativo";
  if (dias <= 10) return "esfriando";
  return "parado";
}

export type Alerta = { clienteId: string; nome: string; nivel: "urgente" | "atencao"; texto: string };

/**
 * O que pede ação hoje, em ordem de urgência.
 *
 * Só entra o que tem um próximo passo claro. Um alerta que ninguém sabe como
 * resolver vira ruído, e ruído faz a lista inteira deixar de ser lida.
 */
export function alertas(clientes: ClienteSaas[], agora = new Date()): Alerta[] {
  const lista: Alerta[] = [];

  for (const c of clientes) {
    if (c.situacao === "CANCELED") continue; // saiu; não há o que fazer hoje

    if (c.faturasVencidas > 0) {
      lista.push({
        clienteId: c.id,
        nome: c.nome,
        nivel: "urgente",
        texto: `${c.faturasVencidas} fatura(s) vencida(s)`,
      });
    }

    if (c.situacao === "TRIAL" && c.testeAte) {
      const d = diasRestantesDeTeste(c.testeAte, agora);
      if (d < 0) {
        lista.push({ clienteId: c.id, nome: c.nome, nivel: "urgente", texto: `teste acabou há ${-d} dia(s) — converter ou pausar` });
      } else if (d <= 3) {
        lista.push({ clienteId: c.id, nome: c.nome, nivel: "atencao", texto: `teste acaba em ${d} dia(s)` });
      }
    }

    if (c.situacao === "SEM_ASSINATURA") {
      lista.push({ clienteId: c.id, nome: c.nome, nivel: "atencao", texto: "sem assinatura cadastrada" });
    }

    const a = ativacao(c, agora);
    if (a === "nunca_ativou") {
      lista.push({ clienteId: c.id, nome: c.nome, nivel: "urgente", texto: "nunca conectou o WhatsApp" });
    } else if (a === "parado") {
      lista.push({ clienteId: c.id, nome: c.nome, nivel: "atencao", texto: "sem mensagem há mais de 10 dias" });
    }
  }

  return lista.sort((x, y) => (x.nivel === y.nivel ? 0 : x.nivel === "urgente" ? -1 : 1));
}
