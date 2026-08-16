import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

// Atendente lê e usa; criar e editar é do Responsável — mesmo critério do
// horário de atendimento. Texto padrão da empresa é decisão da empresa, e
// se cada uma editar o seu o padrão deixa de existir.
function podeEditar(role: string) {
  return role === "OWNER";
}

export async function GET() {
  const user = await requireUser();
  const textos = await prisma.savedText.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ categoria: "asc" }, { titulo: "asc" }],
  });
  return NextResponse.json(textos);
}

const criarSchema = z.object({
  categoria: z.string().trim().min(1).max(40),
  titulo: z.string().trim().min(2).max(80),
  corpo: z.string().trim().min(1).max(4096),
  atalho: z
    .string()
    .trim()
    .toLowerCase()
    .max(20)
    .regex(/^[a-z0-9]*$/, "use só letras e números, sem espaço")
    .optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!podeEditar(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const parsed = criarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { categoria, titulo, corpo, atalho } = parsed.data;

  try {
    const criado = await prisma.savedText.create({
      // Atalho vazio vira null: string vazia colidiria no unique com todos os
      // outros que também não têm atalho.
      data: { tenantId: user.tenantId, categoria, titulo, corpo, atalho: atalho || null },
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (err: unknown) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "já existe um texto com esse título ou atalho" }, { status: 409 });
    }
    throw err;
  }
}
