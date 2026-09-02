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
  isGreeting: z.boolean().default(false),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const semGatilho = parsed.data.isDefault || parsed.data.isGreeting;
  if (!semGatilho && !parsed.data.keyword.trim()) {
    return NextResponse.json(
      { error: "palavra-chave obrigatória (a menos que seja saudação ou resposta padrão)" },
      { status: 400 }
    );
  }

  // Uma saudação por empresa. Duas fariam o cliente novo receber duas
  // boas-vindas seguidas, ou uma delas nunca disparar — as duas leituras
  // são ruins, e nenhuma seria óbvia na tela.
  if (parsed.data.isGreeting) {
    const jaExiste = await prisma.autoReply.findFirst({
      where: { tenantId: user.tenantId, isGreeting: true },
    });
    if (jaExiste) {
      return NextResponse.json(
        { error: "já existe uma saudação de primeiro contato. Edite ou remova a atual." },
        { status: 409 }
      );
    }
  }

  const rule = await prisma.autoReply.create({
    data: {
      tenantId: user.tenantId,
      keyword: parsed.data.keyword.trim(),
      response: parsed.data.response,
      isDefault: parsed.data.isDefault,
      isGreeting: parsed.data.isGreeting,
    },
  });

  return NextResponse.json(rule);
}
