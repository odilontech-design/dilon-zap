import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { podeVerCanal } from "@/lib/team-chat";
import { avisarNoCelular } from "@/lib/push";

/**
 * Setores de que o usuário faz parte — mesma consulta que
 * conversationVisibilityWhere usa pro Inbox, mas aqui é só o necessário pra
 * checar UM canal, não pra montar um WHERE de listagem inteira.
 */
async function meusSetorIds(userId: string): Promise<string[]> {
  const membros = await prisma.setorMembro.findMany({ where: { userId }, select: { setorId: true } });
  return membros.map((m) => m.setorId);
}

export async function GET(req: Request) {
  const user = await requireUser();
  const setorId = new URL(req.url).searchParams.get("setorId") || null;

  if (!podeVerCanal(user.role, await meusSetorIds(user.id), setorId)) {
    return NextResponse.json({ error: "sem acesso a este canal" }, { status: 403 });
  }

  const mensagens = await prisma.teamMessage.findMany({
    where: { tenantId: user.tenantId, setorId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });

  return NextResponse.json(mensagens);
}

const mediaSchema = z.object({
  mediaKey: z.string(),
  mediaType: z.enum(["AUDIO", "IMAGE", "DOCUMENT", "VIDEO"]),
  mediaMimeType: z.string(),
  mediaFileName: z.string().optional(),
  durationSeconds: z.number().int().positive().optional(),
});

const bodySchema = z
  .object({
    setorId: z.string().nullable(),
    text: z.string().max(4096).optional(),
    media: mediaSchema.optional(),
  })
  .refine((v) => (v.text && v.text.trim().length > 0) || v.media, {
    message: "mensagem precisa de texto ou anexo",
  });

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const setorIds = await meusSetorIds(user.id);
  if (!podeVerCanal(user.role, setorIds, parsed.data.setorId)) {
    return NextResponse.json({ error: "sem acesso a este canal" }, { status: 403 });
  }

  const mensagem = await prisma.teamMessage.create({
    data: {
      tenantId: user.tenantId,
      setorId: parsed.data.setorId,
      authorId: user.id,
      body: parsed.data.text ?? "",
      mediaType: parsed.data.media?.mediaType,
      mediaKey: parsed.data.media?.mediaKey,
      mediaMimeType: parsed.data.media?.mediaMimeType,
      mediaFileName: parsed.data.media?.mediaFileName,
      mediaDurationSeconds: parsed.data.media?.durationSeconds,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  // Quem mais enxerga este canal recebe o aviso — sem esperar abrir a tela
  // pra saber que chegou mensagem. Best-effort: nunca atrasa nem quebra o
  // envio da mensagem em si (avisarNoCelular já engole a própria falha).
  void avisarQuemVeOCanal({
    tenantId: user.tenantId,
    setorId: parsed.data.setorId,
    autorId: user.id,
    autorNome: user.name,
    corpo: parsed.data.text?.trim() || (parsed.data.media ? "enviou um anexo" : ""),
  });

  return NextResponse.json(mensagem, { status: 201 });
}

async function avisarQuemVeOCanal({
  tenantId,
  setorId,
  autorId,
  autorNome,
  corpo,
}: {
  tenantId: string;
  setorId: string | null;
  autorId: string;
  autorNome: string;
  corpo: string;
}) {
  const nomeCanal = setorId
    ? (await prisma.setor.findUnique({ where: { id: setorId }, select: { nome: true } }))?.nome ?? "setor"
    : "Geral";

  // Geral é de todo mundo ativo do tenant; canal de setor é só de quem é
  // membro dele, mais o Responsável, que enxerga qualquer canal.
  const destinatarios = await prisma.user.findMany({
    where: {
      tenantId,
      deactivatedAt: null,
      id: { not: autorId },
      ...(setorId
        ? { OR: [{ role: { in: ["OWNER", "SUPERADMIN"] } }, { setores: { some: { setorId } } }] }
        : {}), // Geral: ninguém fica de fora, além do próprio autor já excluído acima
    },
    select: { id: true },
  });

  await Promise.all(
    destinatarios.map((u) =>
      avisarNoCelular(u.id, {
        titulo: `${autorNome} · ${nomeCanal}`,
        corpo,
        url: "/chat-equipe",
        tag: `chat-equipe-${setorId ?? "geral"}`,
      })
    )
  );
}
