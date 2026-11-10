import pino from "pino";
import { prisma } from "@dilon-zap/db";
import { avisarNoCelular } from "@dilon-zap/push";
import { dentroDoHorario, noIntervaloDeAlmoco } from "./business-hours";
import { estagioDoAlerta, JANELA_MAXIMA_MIN, minutosEntre, textoDaEspera } from "./alerta-sem-resposta-regra";

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

/**
 * Alerta de conversa sem resposta (Guttierres, 10/11: o cliente escreveu seis
 * vezes e a conversa ficou parada sem ninguém ver).
 *
 * Só roda para empresa que ligou `alertaSemRespostaMin` (nulo = desligado, o
 * padrão). A conversa precisa estar ABERTA e a última mensagem ser do cliente.
 * Passou do limite: avisa o responsável (ou o setor); passou do dobro: avisa
 * também a gestão. Cada estágio sai uma vez por mensagem do cliente.
 *
 * Só dentro do horário de atendimento e fora do almoço: aviso às 3h da manhã
 * ensina a equipe a ignorar o aviso. Empresa sem horário cadastrado conta como
 * sempre aberta. Quem chega depois do expediente é avisado quando o dia abre
 * (a janela é de 24 h).
 *
 * Nada aqui fala com o cliente: é só push para a equipe, sem risco para o
 * WhatsApp. O controle de "já avisei" fica em memória; o worker reinicia de
 * madrugada, fora do expediente, e o pior caso é repetir um aviso.
 */

const INTERVALO_MS = 60_000;
const TETO_POR_CICLO = 100;
const avisados = new Map<string, number>(); // `${conversa}:${estagio}` -> instante da mensagem avisada

export function startAlertaSemRespostaLoop() {
  const rodar = async () => {
    try {
      await processarAlertasSemResposta();
    } catch (err) {
      logger.error({ err }, "falha no ciclo do alerta de conversa sem resposta");
    }
  };
  const timer = setInterval(() => void rodar(), INTERVALO_MS);
  timer.unref();
  return () => clearInterval(timer);
}

export async function processarAlertasSemResposta(agora = new Date()) {
  const empresas = await prisma.tenant.findMany({
    where: { alertaSemRespostaMin: { not: null }, suspensoEm: null },
    select: {
      id: true,
      timezone: true,
      alertaSemRespostaMin: true,
      almocoInicio: true,
      almocoFim: true,
      uraAtiva: true,
      businessHours: { select: { weekday: true, isOpen: true, opensAt: true, closesAt: true } },
    },
  });

  for (const empresa of empresas) {
    const limite = empresa.alertaSemRespostaMin;
    if (!limite) continue;

    if (empresa.businessHours.length > 0) {
      if (!dentroDoHorario(empresa.businessHours, empresa.timezone, agora)) continue;
      if (noIntervaloDeAlmoco(empresa.businessHours, empresa.timezone, empresa.almocoInicio, empresa.almocoFim, agora)) continue;
    }

    const desde = new Date(agora.getTime() - JANELA_MAXIMA_MIN * 60_000);
    const conversas = await prisma.conversation.findMany({
      where: { tenantId: empresa.id, status: "OPEN", lastMessageAt: { gte: desde }, contact: { grupo: false } },
      orderBy: { lastMessageAt: "asc" },
      take: TETO_POR_CICLO,
      select: {
        id: true,
        assignedToId: true,
        setorId: true,
        uraEnviadaEm: true,
        contact: { select: { name: true, phoneNumber: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, createdAt: true, body: true } },
      },
    });

    for (const c of conversas) {
      const ultima = c.messages[0];
      if (!ultima || ultima.direction !== "INBOUND") continue;
      // Cliente ainda escolhendo no menu: não é falta de resposta de ninguém.
      if (empresa.uraAtiva && c.uraEnviadaEm && !c.assignedToId && !c.setorId) continue;

      const espera = minutosEntre(ultima.createdAt, agora);
      const estagio = estagioDoAlerta(espera, limite);
      if (estagio === 0) continue;

      const marca = ultima.createdAt.getTime();
      const chave = `${c.id}:${estagio}`;
      if (avisados.get(chave) === marca) continue;
      avisados.set(chave, marca);

      try {
        const destinatarios = await destinatariosDoAlerta(empresa.id, c.assignedToId, c.setorId, estagio);
        const titulo = `⏰ Sem resposta há ${textoDaEspera(espera)}`;
        const corpo = `${c.contact.name || c.contact.phoneNumber || "Cliente"}: ${ultima.body.trim().replace(/\s+/g, " ").slice(0, 100) || "mensagem"}`;
        await Promise.all(
          destinatarios.map((userId) =>
            avisarNoCelular(userId, { titulo, corpo, url: `/inbox?open=${c.id}`, tag: `sem-resposta-${c.id}` })
          )
        );
      } catch (err) {
        logger.error({ err, conversationId: c.id }, "falha ao avisar conversa sem resposta");
      }
    }
  }

  if (avisados.size > 5_000) avisados.clear();
}

async function destinatariosDoAlerta(
  tenantId: string,
  responsavelId: string | null,
  setorId: string | null,
  estagio: 1 | 2
): Promise<string[]> {
  const ids = new Set<string>();
  if (responsavelId) {
    ids.add(responsavelId);
  } else if (setorId) {
    const membros = await prisma.setorMembro.findMany({
      where: { setorId, user: { deactivatedAt: null } },
      select: { userId: true },
    });
    for (const m of membros) ids.add(m.userId);
  }
  // Sem dono e sem setor, ou no segundo estágio: a gestão.
  if (estagio === 2 || ids.size === 0) {
    const gestao = await prisma.user.findMany({
      where: { tenantId, role: "OWNER", deactivatedAt: null },
      select: { id: true },
    });
    for (const u of gestao) ids.add(u.id);
  }
  return [...ids];
}
