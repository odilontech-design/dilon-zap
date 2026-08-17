import pino from "pino";
import { prisma } from "@dilon-zap/db";
import {
  AVATAR_TTL_MS,
  fetchAndSaveAvatar,
  getSocketForTenant,
  getTenantsConectados,
} from "./session-manager";

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

/**
 * Varredura das fotos de perfil.
 *
 * Existe por dois motivos que a busca no fluxo da mensagem não cobre:
 *
 * 1. Consertar o que já está no banco. Até aqui guardávamos o ENDEREÇO da
 *    foto no CDN do WhatsApp, e esses endereços expiram — metade dos que
 *    tínhamos em produção já respondia 403, então a foto do contato sumia da
 *    tela semanas depois sozinha. Só a busca no fluxo da mensagem conserta
 *    apenas quem escrever de novo; quem não escrever fica sem foto pra
 *    sempre.
 *
 * 2. Pegar troca de foto. Quem já tem foto guardada nunca era reconferido.
 */

// Lote pequeno de propósito: cada contato é uma chamada à API do WhatsApp, e
// só a Believe tem 355. Despejar tudo de uma vez num número de negócio é o
// tipo de rajada que chama atenção. 20 a cada 5 minutos varre a base em
// algumas horas e passa despercebido.
const LOTE = 20;
const INTERVALO_MS = 5 * 60_000;
const PAUSA_ENTRE_CONTATOS_MS = 1_000;

export function startAvatarRefreshLoop() {
  const rodar = async () => {
    try {
      await refrescarAvatares();
    } catch (err) {
      logger.error({ err }, "falha no ciclo de fotos de perfil");
    }
  };

  void rodar();
  const timer = setInterval(() => void rodar(), INTERVALO_MS);
  return () => clearInterval(timer);
}

export async function refrescarAvatares() {
  const conectados = getTenantsConectados();
  if (conectados.length === 0) return;

  const pendentes = await prisma.contact.findMany({
    where: {
      tenantId: { in: conectados },
      OR: [{ avatarCheckedAt: null }, { avatarCheckedAt: { lt: new Date(Date.now() - AVATAR_TTL_MS) } }],
    },
    // Nunca conferido primeiro: são os contatos que estão hoje sem foto na
    // tela, então é o que o usuário vê melhorar antes.
    orderBy: { avatarCheckedAt: { sort: "asc", nulls: "first" } },
    select: { id: true, waJid: true, tenantId: true },
    take: LOTE,
  });

  for (const contato of pendentes) {
    const socket = getSocketForTenant(contato.tenantId);
    // A empresa caiu no meio do lote. fetchAndSaveAvatar marca a tentativa
    // logo na entrada, então pular aqui NÃO trava a fila: o contato continua
    // sem avatarCheckedAt e volta no próximo ciclo, quando reconectar.
    if (!socket) continue;

    try {
      const resultado = await fetchAndSaveAvatar(socket, contato.id, contato.waJid);
      logger.debug({ waJid: contato.waJid, resultado }, "foto de perfil conferida");
    } catch (err) {
      logger.warn({ err, waJid: contato.waJid }, "falha ao conferir foto de perfil");
    }
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CONTATOS_MS));
  }
}
