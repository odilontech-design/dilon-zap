import { prisma } from "@dilon-zap/db";

type Alvo = { id: string; tenantId: string; role: string };

/**
 * Regra de ativar/desativar usuário, num lugar só.
 *
 * Existem dois caminhos até aqui — o Responsável pela tela /usuarios da
 * empresa, e a Dilon Tech pelo /admin — e eles precisam se comportar igual.
 * Duas cópias da mesma regra divergem com o tempo: uma ganha uma trava nova,
 * a outra não, e aí o caminho esquecido vira o buraco.
 */

/**
 * Devolve o motivo do impedimento, ou null se pode seguir.
 *
 * `atorId` é quem está clicando — passe undefined quando for a Dilon Tech
 * pelo /admin, porque aí o ator não pertence à empresa e a regra de "não
 * mexa em si mesmo" não se aplica.
 */
export async function impedimentoParaAlterarStatus(
  alvo: Alvo,
  ativo: boolean,
  virandoAgente: boolean,
  atorId?: string
): Promise<string | null> {
  const saindoDeCena = ativo === false || virandoAgente;
  if (!saindoDeCena) return null;

  // Ninguém se desativa nem se rebaixa: os dois levam a uma conta sem volta
  // pelas próprias mãos.
  if (atorId && alvo.id === atorId) {
    return "você não pode desativar nem rebaixar a própria conta";
  }

  // E a empresa não pode ficar sem nenhum responsável ativo — desse estado a
  // única saída seria acionar o suporte, justamente o que a tela evita.
  if (alvo.role === "OWNER") {
    const outrosDonos = await prisma.user.count({
      where: {
        tenantId: alvo.tenantId,
        role: "OWNER",
        deactivatedAt: null,
        id: { not: alvo.id },
      },
    });
    if (outrosDonos === 0) return "a empresa ficaria sem nenhum responsável ativo";
  }

  return null;
}

/**
 * Ao desativar, libera as conversas abertas que estavam na mão da pessoa.
 * Sem isso elas ficam num limbo: constam atribuídas, e ninguém assume porque
 * parecem já ter dono.
 *
 * Só as não resolvidas — conversa fechada não precisa de dono, e mexer nela
 * só apagaria de graça o registro de quem cuidou daquele atendimento. O
 * senderUserId das mensagens nunca é tocado: quem enviou o quê é o histórico
 * que não pode se perder.
 */
export async function liberarConversasDe(userId: string, tenantId: string): Promise<number> {
  const r = await prisma.conversation.updateMany({
    where: { tenantId, assignedToId: userId, status: { not: "RESOLVED" } },
    data: { assignedToId: null },
  });
  return r.count;
}
