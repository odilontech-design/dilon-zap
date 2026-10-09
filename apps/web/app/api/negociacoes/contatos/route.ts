import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

/**
 * Busca de contato para criar negociação. Existe separada de /api/contacts
 * porque aquela devolve a base inteira a cada consulta; aqui são no máximo 15.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const digitos = q.replace(/\D/g, "");
  const contatos = await prisma.contact.findMany({
    where: {
      tenantId: user.tenantId,
      grupo: false,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { waName: { contains: q, mode: "insensitive" } },
        ...(digitos.length >= 3
          ? [{ phoneNumber: { contains: digitos } }, { waJid: { startsWith: digitos } }]
          : []),
      ],
    },
    select: { id: true, name: true, phoneNumber: true, waJid: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return NextResponse.json(
    contatos.map((c) => ({
      id: c.id,
      nome: c.name,
      telefone: c.phoneNumber ?? (c.waJid.endsWith("@s.whatsapp.net") ? c.waJid.split("@")[0] : null),
    }))
  );
}
