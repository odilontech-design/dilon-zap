import { prisma } from "@dilon-zap/db";
import { resolveWhatsAppJid } from "./worker-client";

/**
 * Cria (ou acha) um contato a partir de um telefone, usando o worker pra
 * resolver o JID canônico (pode ser @s.whatsapp.net ou @lid, dependendo da
 * conta). Se já existir um contato criado com o formato padrão antes dessa
 * resolução existir, migra o registro pro JID certo em vez de duplicar.
 */
export async function upsertContactByPhone(tenantId: string, phoneDigits: string, name?: string) {
  const { jid: resolvedJid } = await resolveWhatsAppJid(tenantId, phoneDigits);
  const fallbackJid = `${phoneDigits}@s.whatsapp.net`;
  const canonicalJid = resolvedJid ?? fallbackJid;

  let contact = await prisma.contact.findUnique({
    where: { tenantId_waJid: { tenantId, waJid: canonicalJid } },
  });

  if (!contact && canonicalJid !== fallbackJid) {
    const legacy = await prisma.contact.findUnique({
      where: { tenantId_waJid: { tenantId, waJid: fallbackJid } },
    });
    if (legacy) {
      contact = await prisma.contact.update({
        where: { id: legacy.id },
        data: { waJid: canonicalJid },
      });
    }
  }

  if (contact) {
    if (name && !contact.name) {
      contact = await prisma.contact.update({ where: { id: contact.id }, data: { name } });
    }
    return { contact, created: false };
  }

  contact = await prisma.contact.create({
    data: { tenantId, waJid: canonicalJid, name: name || null },
  });
  return { contact, created: true };
}
