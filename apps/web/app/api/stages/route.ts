import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { funilDaEmpresa } from "@/lib/funis";

/**
 * Etapas de um funil. Sem ?funilId, é o funil padrão da empresa.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const funil = await funilDaEmpresa(user.tenantId, new URL(req.url).searchParams.get("funilId"));
  if (!funil) return NextResponse.json({ error: "funil não encontrado" }, { status: 404 });

  const stages = await prisma.stage.findMany({
    where: { tenantId: user.tenantId, funilId: funil.id },
    orderBy: { position: "asc" },
  });

  return NextResponse.json(stages);
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const bodySchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(HEX_COLOR, "cor precisa ser um hex tipo #0000F5"),
  funilId: z.string().optional(),
  probabilidade: z.number().int().min(0).max(100).optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const funil = await funilDaEmpresa(user.tenantId, parsed.data.funilId);
  if (!funil) return NextResponse.json({ error: "funil não encontrado" }, { status: 404 });

  const name = parsed.data.name.trim();
  // O nome é único POR FUNIL: "Qualificação" pode existir em mais de um.
  const existing = await prisma.stage.findUnique({ where: { funilId_name: { funilId: funil.id, name } } });
  if (existing) return NextResponse.json({ error: "já existe uma etapa com esse nome neste funil" }, { status: 409 });

  // Nasce no fim da fila de colunas — o dono reordena depois se quiser.
  const last = await prisma.stage.findFirst({ where: { funilId: funil.id }, orderBy: { position: "desc" } });

  const stage = await prisma.stage.create({
    data: {
      tenantId: user.tenantId,
      funilId: funil.id,
      name,
      color: parsed.data.color,
      probabilidade: parsed.data.probabilidade ?? 0,
      position: (last?.position ?? -1) + 1,
    },
  });

  return NextResponse.json(stage);
}
