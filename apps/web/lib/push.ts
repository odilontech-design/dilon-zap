import webpush from "web-push";
import { prisma } from "@dilon-zap/db";

/**
 * Notificação no celular (Web Push).
 *
 * Existe pelo pedido da Hemoderi: quem não fica no computador o dia todo
 * precisa ser avisado quando uma conversa cai pra ele. Sem isso, a conversa
 * transferida só era descoberta quando a pessoa lembrava de abrir o sistema.
 *
 * O envio é best-effort de propósito — nunca derruba nem atrasa a ação que o
 * disparou. Falhar em avisar é ruim; falhar em TRANSFERIR porque o aviso não
 * saiu seria muito pior.
 */

let configurado = false;

function configurar(): boolean {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return false;
  if (!configurado) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:contato@dilontech.com.br", publica, privada);
    configurado = true;
  }
  return true;
}

export type AvisoPush = {
  titulo: string;
  corpo: string;
  /** Pra onde a notificação leva ao ser tocada. */
  url?: string;
  /** Agrupa avisos da mesma conversa num só, em vez de empilhar. */
  tag?: string;
};

/**
 * Manda o aviso pra todos os aparelhos de uma pessoa.
 *
 * Inscrição que o serviço de push recusa com 404/410 está morta (app
 * desinstalado, permissão revogada) e é apagada na hora — senão a tabela vira
 * um cemitério que a gente tenta acordar a cada transferência, pra sempre.
 */
export async function avisarNoCelular(userId: string, aviso: AvisoPush): Promise<void> {
  if (!configurar()) return;

  const inscricoes = await prisma.pushSubscription.findMany({ where: { userId } });
  if (inscricoes.length === 0) return;

  const payload = JSON.stringify({ titulo: aviso.titulo, corpo: aviso.corpo, url: aviso.url, tag: aviso.tag });

  await Promise.all(
    inscricoes.map(async (i) => {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          payload
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: i.id } }).catch(() => {});
          return;
        }
        console.error("[push] falha ao notificar", { userId, status });
      }
    })
  );
}
