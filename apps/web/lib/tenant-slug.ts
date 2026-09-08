import { prisma } from "@dilon-zap/db";

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Slug livre a partir do nome da empresa.
 *
 * `ignorarId` existe pro caso da renomeação: sem ele, renomear uma empresa
 * pro nome que ela já tem colidiria com o próprio registro e viraria
 * "empresa-1" sem motivo.
 */
export async function slugUnico(name: string, ignorarId?: string) {
  const base = slugify(name) || "tenant";
  let slug = base;
  let tentativa = 0;

  while (true) {
    const existente = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!existente || existente.id === ignorarId) return slug;
    tentativa++;
    slug = `${base}-${tentativa}`;
  }
}
