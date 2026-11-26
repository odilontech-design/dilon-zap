import { avisarNoCelular } from "@dilon-zap/push";
import { prisma } from "@dilon-zap/db";

/**
 * Rodízio de vendedores: quando a IA passa a conversa para a equipe (visita, negociação, financiamento, pediu uma pessoa),
 * o vendedor da vez passa a ser o responsável e recebe um aviso no celular. Sem isso a conversa cai em "Pendentes" sem dono, e
 * o painel de leads mostra tudo em "Sem vendedor definido" (era o caso da Sales: 100% das conversas sem responsável).
 *
 * Só atribui NA PASSAGEM, nunca antes: conversa com responsável deixa de ser atendida pela IA e pelo acompanhamento, então
 * atribuir já na chegada do lead desligaria a IA exatamente onde ela é útil.
 *
 * Quem participa é a gestão que marca (`rodizioUsuarioIds`). Sem ninguém marcado, nada é atribuído.
 */

/** A hora cheia no fuso da loja (a mesma conta de imediata.ts; copiada aqui para não criar um ciclo de importação com executar.ts). */
function horaNaLoja(agora: Date, timezone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false }).format(agora)) % 24;
}

/** Aviso no celular só no horário da loja: a atribuição vale sempre, mas ninguém é acordado de madrugada. */
const AVISO_DAS = 7;
const AVISO_ATE = 22;

/**
 * Quem é o próximo: a ordem da lista de participantes, em círculo, pulando quem não está ativo. Sem registro do último (ou
 * se o último saiu da lista), começa pelo primeiro. Devolve null se ninguém está disponível.
 */
export function proximoDoRodizio(p: { participantes: string[]; ultimoId: string | null; ativos: Set<string> }): string | null {
  const fila = p.participantes.filter((id, i) => p.ativos.has(id) && p.participantes.indexOf(id) === i);
  if (!fila.length) return null;
  const i = p.ultimoId ? fila.indexOf(p.ultimoId) : -1;
  if (i >= 0) return fila[(i + 1) % fila.length];
  // O último saiu do rodízio (ou foi desativado): continua de onde ele estaria na lista original, sem repetir o mesmo cedo.
  if (p.ultimoId) {
    const pos = p.participantes.indexOf(p.ultimoId);
    if (pos >= 0) {
      for (let k = 1; k <= p.participantes.length; k++) {
        const candidato = p.participantes[(pos + k) % p.participantes.length];
        if (fila.includes(candidato)) return candidato;
      }
    }
  }
  return fila[0];
}

type LojaDoRodizio = { tenantId: string; rodizio: boolean; rodizioUsuarioIds: string[]; rodizioUltimoId: string | null; tenant: { timezone: string } };

/**
 * Atribui a conversa ao vendedor da vez, se a loja usa o rodízio, a conversa ainda não tem responsável e há alguém disponível.
 * Devolve o id de quem recebeu, ou null. Nunca lança: a passagem para a equipe já aconteceu e não pode falhar por causa disto.
 */
export async function atribuirPeloRodizio(conversationId: string, loja: LojaDoRodizio, motivo: string, agora: Date): Promise<string | null> {
  try {
    if (!loja.rodizio || !loja.rodizioUsuarioIds.length) return null;
    // "A equipe respondeu" já está com uma pessoa.
    if (motivo === "equipe respondeu") return null;

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, tenantId: true, assignedToId: true, ticketNumber: true, contact: { select: { name: true, waName: true, phoneNumber: true } } },
    });
    if (!conv || conv.tenantId !== loja.tenantId || conv.assignedToId) return null;

    // Só gente da própria empresa e ainda ativa (um id de outra empresa, ou de quem saiu, nunca recebe).
    const usuarios = await prisma.user.findMany({ where: { id: { in: loja.rodizioUsuarioIds }, tenantId: loja.tenantId, deactivatedAt: null }, select: { id: true } });
    // O ponteiro vem do banco na hora (não da config lida no começo da volta): duas passagens seguidas na mesma volta não podem cair na mesma pessoa.
    const cfg = await prisma.vendedorIaConfig.findUnique({ where: { tenantId: loja.tenantId }, select: { rodizioUltimoId: true } });
    const escolhido = proximoDoRodizio({ participantes: loja.rodizioUsuarioIds, ultimoId: cfg?.rodizioUltimoId ?? loja.rodizioUltimoId, ativos: new Set(usuarios.map((u) => u.id)) });
    if (!escolhido) return null;

    await prisma.$transaction([
      // Só se ainda estiver sem responsável: uma pessoa pode ter pegado a conversa no meio-tempo.
      prisma.conversation.updateMany({ where: { id: conv.id, assignedToId: null }, data: { assignedToId: escolhido, assignedAt: agora, assignedById: null, assignmentSeenAt: null } }),
      prisma.vendedorIaConfig.update({ where: { tenantId: loja.tenantId }, data: { rodizioUltimoId: escolhido } }),
    ]);

    const hora = horaNaLoja(agora, loja.tenant.timezone);
    if (hora >= AVISO_DAS && hora < AVISO_ATE) {
      const nome = conv.contact.name ?? conv.contact.waName ?? conv.contact.phoneNumber ?? "Cliente";
      // Sem await e sem lançar: o aviso é secundário.
      void avisarNoCelular(escolhido, { titulo: "Cliente para você", corpo: `${nome} · #${conv.ticketNumber} — a IA passou (${motivo})`, url: `/inbox?open=${conv.id}`, tag: `conversa-${conv.id}` }).catch(() => {});
    }
    return escolhido;
  } catch (e) {
    console.error(`[rodizio] conversa ${conversationId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
