import pino from "pino";
import { prisma } from "@dilon-zap/db";

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

// Varredura periódica que junta contatos duplicados da MESMA pessoa.
//
// Por que existe, já que resolveContact() já reconcilia na chegada da
// mensagem: aquela reconciliação é de tiro único. Ela roda uma vez, no
// instante em que o contato é criado, com os sinais que existirem naquele
// milissegundo — o telefone (senderPn) e a foto de perfil. Quando a mensagem
// que cria o contato é uma que FALHOU na descriptografia do Signal, o Baileys
// entrega o evento sem conteúdo e sem sinal aproveitável: nasce um contato
// @lid solto, e nada nunca mais revisita. Foi assim que Taisa, Inara,
// Isabella, Carina, Bruna e Ludmila duplicaram — todas com mensagens de corpo
// vazio do lado @lid.
//
// A foto, ironicamente, chega um segundo depois: fetchAndSaveAvatar() grava
// com sucesso logo após a reconciliação já ter passado. Esta varredura é o
// "revisitar quando o sinal chegar" que faltava.
const INTERVALO_MS = 10 * 60 * 1000;

// Nome do arquivo no CDN da Meta, sem os parâmetros de assinatura que mudam a
// cada request. É atribuído no upload, então é único por foto enviada — duas
// pessoas diferentes não colidem aqui nem postando a mesma imagem.
function arquivoDaFoto(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname.split("/").pop() || null;
  } catch {
    return null;
  }
}

type Candidato = {
  id: string;
  tenantId: string;
  name: string | null;
  waJid: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  stageId: string | null;
  dealValueCents: number;
};

async function mesclar(vive: Candidato, morre: Candidato) {
  const conversas = await prisma.conversation.findMany({
    where: { contactId: { in: [vive.id, morre.id] } },
    select: {
      id: true, contactId: true, ticketNumber: true, tags: true,
      assignedToId: true, status: true, lastMessageAt: true,
    },
    orderBy: { ticketNumber: "asc" },
  });

  // Contato que sobrevive e conversa que sobrevive são decisões separadas: o
  // contato certo é o que tem nome e telefone, mas a conversa certa é a de
  // ticket mais antigo — é o número que o atendente cita e onde costuma estar
  // o grosso do histórico. Nem sempre os dois estão do mesmo lado.
  const convFica = conversas[0];
  const convSai = conversas[1];

  // Colisões de waMessageId precisam sair ANTES e FORA da transação: dentro
  // dela um P2002 aborta tudo, e nem try/catch recupera (a transação já está
  // marcada como abortada no Postgres).
  if (convFica && convSai) {
    const noDestino = new Set(
      (await prisma.message.findMany({ where: { conversationId: convFica.id }, select: { waMessageId: true } }))
        .map((m) => m.waMessageId)
        .filter((id): id is string => Boolean(id))
    );
    const colidem = (
      await prisma.message.findMany({ where: { conversationId: convSai.id }, select: { id: true, waMessageId: true } })
    ).filter((m) => m.waMessageId && noDestino.has(m.waMessageId));

    if (colidem.length > 0) {
      const ids = colidem.map((m) => m.id);
      await prisma.messageReaction.deleteMany({ where: { messageId: { in: ids } } }).catch(() => {});
      await prisma.message.deleteMany({ where: { id: { in: ids } } });
    }
  }

  // O JID que o WhatsApp está usando AGORA pra essa pessoa é o do contato dono
  // da conversa com mensagem mais recente — pode muito bem ser o @lid. Tem que
  // sair do contactId da conversa: qual delas é a "que fica" é decidido por
  // ticket, não por lado, então os dois não andam juntos.
  const maisRecente = conversas.reduce(
    (a, b) => (+b.lastMessageAt > +a.lastMessageAt ? b : a),
    conversas[0]
  );
  const jidAtivo = maisRecente?.contactId === morre.id ? morre.waJid : vive.waJid;
  const telefone = vive.phoneNumber ?? (vive.waJid.endsWith("@s.whatsapp.net") ? vive.waJid.split("@")[0] : null);

  await prisma.$transaction(async (tx) => {
    if (convSai) {
      await tx.message.updateMany({ where: { conversationId: convSai.id }, data: { conversationId: convFica.id } });
      await tx.conversation.delete({ where: { id: convSai.id } });
    }
    if (convFica) {
      // Re-apontar só DEPOIS de apagar a outra: enquanto as duas coexistem,
      // as duas disputariam o unique [contactId, sessionId]. E precisa vir
      // ANTES do delete do contato, que tem cascade e levaria a conversa junto.
      await tx.conversation.update({
        where: { id: convFica.id },
        data: {
          contactId: vive.id,
          tags: [...new Set([...(convFica.tags ?? []), ...(convSai?.tags ?? [])])],
          assignedToId: convFica.assignedToId ?? convSai?.assignedToId ?? null,
          status: convFica.status === "OPEN" || convSai?.status === "OPEN" ? "OPEN" : convFica.status,
          lastMessageAt: new Date(Math.max(+convFica.lastMessageAt, +(convSai?.lastMessageAt ?? 0))),
        },
      });
    }

    // Apagar o duplicado antes de reescrever o waJid do sobrevivente: quando o
    // JID ativo é o @lid, os dois disputariam o unique [tenantId, waJid].
    await tx.contact.delete({ where: { id: morre.id } });
    await tx.contact.update({
      where: { id: vive.id },
      data: {
        name: vive.name ?? morre.name,
        phoneNumber: telefone,
        waJid: jidAtivo,
        stageId: vive.stageId ?? morre.stageId,
        dealValueCents: vive.dealValueCents || morre.dealValueCents,
      },
    });
  });

  logger.info(
    { contato: vive.name ?? telefone, ticket: convFica?.ticketNumber, jidRemovido: morre.waJid, jidAtivo },
    "contato duplicado reconciliado"
  );
}

export async function reconcileDuplicateContacts() {
  const contatos: Candidato[] = await prisma.contact.findMany({
    where: { avatarUrl: { not: null } },
    select: {
      id: true, tenantId: true, name: true, waJid: true,
      phoneNumber: true, avatarUrl: true, stageId: true, dealValueCents: true,
    },
  });

  const grupos = new Map<string, Candidato[]>();
  for (const c of contatos) {
    const arquivo = arquivoDaFoto(c.avatarUrl);
    if (!arquivo) continue;
    const chave = `${c.tenantId}|${arquivo}`;
    const atual = grupos.get(chave);
    if (atual) atual.push(c);
    else grupos.set(chave, [c]);
  }

  for (const grupo of grupos.values()) {
    // Só o par simples e inequívoco: exatamente 2 contatos, um deles @lid.
    // Grupos maiores ou sem @lid saem no log pra revisão manual em vez de
    // arriscar juntar automaticamente duas pessoas diferentes.
    if (grupo.length < 2) continue;
    if (grupo.length > 2) {
      logger.warn({ jids: grupo.map((c) => c.waJid) }, "grupo com 3+ contatos na mesma foto, revisar a mão");
      continue;
    }

    const vive = grupo.find((c) => c.waJid.endsWith("@s.whatsapp.net"));
    const morre = grupo.find((c) => c !== vive);
    if (!vive || !morre || !morre.waJid.endsWith("@lid")) continue;

    try {
      await mesclar(vive, morre);
    } catch (err) {
      // Um par problemático não pode impedir os outros de serem reconciliados.
      logger.error({ err, jids: [vive.waJid, morre.waJid] }, "falha ao reconciliar contato duplicado");
    }
  }
}

export function watchForDuplicateContacts() {
  setInterval(() => {
    reconcileDuplicateContacts().catch((err) =>
      logger.error({ err }, "falha na varredura de contatos duplicados")
    );
  }, INTERVALO_MS);
}
