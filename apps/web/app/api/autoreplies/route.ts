import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  const user = await requireUser();

  const rules = await prisma.autoReply.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rules);
}

const bodySchema = z.object({
  keyword: z.string().max(80),
  response: z.string().min(1).max(4096),
  isDefault: z.boolean().default(false),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (!parsed.data.isDefault && !parsed.data.keyword.trim()) {
    return NextResponse.json(
      { error: "palavra-chave obrigatória (a menos que seja a resposta padrão)" },
      { status: 400 }
    );
  }

  const rule = await prisma.autoReply.create({
    data: {
      tenantId: user.tenantId,
      keyword: parsed.data.keyword.trim(),
      response: parsed.data.response,
      isDefault: parsed.data.isDefault,
    },
  });

  return NextResponse.json(rule);
}
