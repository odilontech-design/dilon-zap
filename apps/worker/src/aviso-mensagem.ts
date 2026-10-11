import { prisma } from "@dilon-zap/db";
import { avisarNoCelular } from "@dilon-zap/push";

/**
 * Aviso (push) de mensagem nova de cliente — no celular e no computador.
 *
 * Até a v1.18 o push só saía em transferência, chat da equipe e contas a
 * vencer: mensagem de cliente nunca avisava ninguém, só tocava som com o
 * Inbox aberto. Foi o que a Believe relatou ("as notificações não chegam").
 *
 * Quem recebe segue a mesma ideia de quem ENXERGA a conversa:
 * - conversa com responsável → só ele;
 * - na fila de um setor → os membros do setor (sem membros, o responsável da
 *   conta, pra ninguém ficar sem saber);
 * - na fila geral → todo mundo que vê a fila geral (só a gestão, quando a
 *   empresa restringe a fila geral);
 * - cliente ainda escolhendo no menu da URA → ninguém: ele ainda não disse
 *   com quem quer falar, e o aviso sai quando escolher.
 *
 * Uma rajada de mensagens da mesma conversa vira um aviso só por minuto —
 * cliente que manda "oi", "tudo bem?", "queria saber..." em três linhas não
 * pode fazer o celular da atendente vibrar três vezes.
 */

const JANELA_MS = 60_000;
const ultimoAviso = new Map<string, number>();

function limparAntigos(agora: number) {
  if (ultimoAviso.size < 5_000) return;
  for (const [k, t] of ultimoAviso) if (agora - t > JANELA_MS) ultimoAviso.delete(k);
}

const ROTULO_MIDIA: Record<string, string> = {
  IMAGE: "📷 Foto",
  VIDEO: "🎬 Vídeo",
  AUDIO: "🎤 Áudio",
  DOCUMENT: "📄 Documento",
};

/** Texto do aviso: o que o cliente escreveu, ou o tipo de mídia. Puro, para teste. */
export function corpoDoAviso(texto: string, mediaType?: string, fileName?: string): string {
  const t = texto.trim().replace(/\s+/g, " ");
  if (t) return t.length > 140 ? `${t.slice(0, 139)}…` : t;
  if (fileName === "figurinha.webp") return "Figurinha";
  return (mediaType && ROTULO_MIDIA[mediaType]) || "Nova mensagem";
}

export async function avisarMensagemNova(params: {
  tenantId: string;
  conversationId: string;
  texto: string;
  mediaType?: string;
  mediaFileName?: string;
}): Promise<void> {
  const conversa = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: {
      assignedToId: true,
      setorId: true,
      uraEnviadaEm: true,
      contact: { select: { name: true, phoneNumber: true, grupo: true } },
    },
  });
  if (!conversa || conversa.contact.grupo) return;

  let destinatarios: string[];
  if (conversa.assignedToId) {
    destinatarios = [conversa.assignedToId];
  } else if (conversa.setorId) {
    const membros = await prisma.setorMembro.findMany({
      where: { setorId: conversa.setorId, user: { deactivatedAt: null } },
      select: { userId: true },
    });
    destinatarios = membros.map((m) => m.userId);
    if (destinatarios.length === 0) {
      const gestao = await prisma.user.findMany({
        where: { tenantId: params.tenantId, role: "OWNER", deactivatedAt: null },
        select: { id: true },
      });
      destinatarios = gestao.map((u) => u.id);
    }
  } else {
    const tenant = await prisma.tenant.findUnique({
      where: { id: params.tenantId },
      select: { restringirFilaGeral: true, conversasAbertasATodos: true, uraAtiva: true },
    });
    // Ainda no menu da URA. Com a URA desligada, uraEnviadaEm antigo não vale.
    if (tenant?.uraAtiva && conversa.uraEnviadaEm) return;
    const soGestao = tenant?.restringirFilaGeral && !tenant.conversasAbertasATodos;
    const usuarios = await prisma.user.findMany({
      where: {
        tenantId: params.tenantId,
        deactivatedAt: null,
        ...(soGestao ? { role: { in: ["OWNER", "SUPERADMIN"] } } : {}),
      },
      select: { id: true },
    });
    destinatarios = usuarios.map((u) => u.id);
  }
  if (destinatarios.length === 0) return;

  const agora = Date.now();
  limparAntigos(agora);
  const pendentes = destinatarios.filter((userId) => {
    const chave = `${params.conversationId}:${userId}`;
    const antes = ultimoAviso.get(chave);
    if (antes && agora - antes < JANELA_MS) return false;
    ultimoAviso.set(chave, agora);
    return true;
  });
  if (pendentes.length === 0) return;

  const titulo = conversa.contact.name || conversa.contact.phoneNumber || "Cliente";
  const corpo = corpoDoAviso(params.texto, params.mediaType, params.mediaFileName);
  await Promise.all(
    pendentes.map((userId) =>
      avisarNoCelular(userId, {
        titulo,
        corpo,
        url: `/inbox?open=${params.conversationId}`,
        tag: `conversa-${params.conversationId}`,
      })
    )
  );
}
