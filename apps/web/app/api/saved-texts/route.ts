import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

// Quem atende também escreve o texto: a consultora e o financeiro conhecem
// a objeção real do cliente melhor que quem cadastra de fora. Os 15 textos
// iniciais ficaram com 1 em uso — os de venda, que são trabalho da
// consultora, nunca saíram do lugar.
//
// EXCLUIR continua só do Responsável (ver a rota [id]): criar e editar são
// reversíveis e visíveis; apagar tira de todo mundo um texto que ninguém vai
// notar que sumiu até precisar dele.
function podeEditar(role: string) {
  return role === "OWNER" || role === "AGENT" || role === "FINANCEIRO";
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
