import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const patchSchema = z.object({
  categoria: z.string().trim().min(1).max(40).optional(),
  titulo: z.string().trim().min(2).max(80).optional(),
  corpo: z.string().trim().min(1).max(4096).optional(),
  atalho: z
    .string()
    .trim()
    .toLowerCase()
    .max(20)
    .regex(/^[a-z0-9]*$/, "use só letras e números, sem espaço")
    .optional(),
  isActive: z.boolean().optional(),
});

// Mesma regra do POST: quem atende escreve e corrige o próprio texto.
function podeEditar(role: string) {
  return role === "OWNER" || role === "AGENT" || role === "FINANCEIRO";
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!podeEditar(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Filtra pelo tenant junto com o id: sem isso, chutar um id alcançaria
  // texto de outra empresa.
  const alvo = await prisma.savedText.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!alvo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { atalho, ...resto } = parsed.data;

  try {
    const atualizado = await prisma.savedText.update({
      where: { id: alvo.id },
      data: { ...resto, ...(atalho !== undefined ? { atalho: atalho || null } : {}) },
    });
    return NextResponse.json(atualizado);
  } catch (err: unknown) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "já existe um texto com esse título ou atalho" }, { status: 409 });
    }
    throw err;
  }
}

// Apagar segue só do Responsável, de propósito: o texto é compartilhado por
// todo o time, e sumir um não gera aviso nenhum — ninguém descobre até ir
// usar e não achar.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (user.role !== "OWNER") return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const alvo = await prisma.savedText.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!alvo) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.savedText.delete({ where: { id: alvo.id } });
  return NextResponse.json({ ok: true });
}
