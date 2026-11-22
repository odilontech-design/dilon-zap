// Fixture de teste: código no padrão certo. Nunca é executado, só lido como texto.
// import { prisma } from "@dilon-zap/db";
import { prisma } from "@dilon-zap/db";

export async function listar(user: { tenantId: string }) {
  return prisma.contact.findMany({ where: { tenantId: user.tenantId, grupo: false } });
}

export async function apagar(user: { tenantId: string }, id: string) {
  return prisma.contact.deleteMany({ where: { id, tenantId: user.tenantId } });
}
