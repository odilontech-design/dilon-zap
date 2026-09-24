import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser, type CurrentUser } from "@/lib/session";
import { podeVerCanal } from "@/lib/team-chat";
import { avisarNoCelular } from "@/lib/push";

/**
 * Setores de que o usuário faz parte — só o necessário pra checar UM canal,
 * não pra montar um WHERE de listagem inteira.
 */
async function meusSetorIds(userId: string): Promise<string[]> {
  const membros = await prisma.setorMembro.findMany({ where: { userId }, select: { setorId: true } });
  return membros.map((m) => m.setorId);
}

/** O colega existe, é da mesma empresa, está ativo e não sou eu. */
async function colegaValido(user: CurrentUser, colegaId: string) {
  if (colegaId === user.id) return false;
  const colega = await prisma.user.findFirst({
    where: { id: colegaId, tenantId: user.tenantId, deactivatedAt: null },
    select: { id: true },
  });
  return !!colega;
}

export async function GET(req: Request) {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const setorId = params.get("setorId") || null;
  const com = params.get("com") || null; // conversa direta com esta pessoa

  let where;
  if (com) {
    if (!(await colegaValido(user, com))) {
      return NextResponse.json({ error: "colega não encontrado" }, { status: 404 });
    }
    // Só as mensagens entre nós dois, nos dois sentidos.
    where = {
      tenantId: user.tenantId,
      setorId: null,
      OR: [
        { authorId: user.id, destinatarioId: com },
        { authorId: com, destinatarioId: user.id },
      ],
    };
  } else {
    if (!podeVerCanal(user.role, await meusSetorIds(user.id), setorId)) {
      return NextResponse.json({ error: "sem acesso a este canal" }, { status: 403 });
    }
    // destinatarioId nulo: sem isso o Geral misturaria as conversas diretas.
    where = { tenantId: user.tenantId, setorId, destinatarioId: null };
  }

  const mensagens = await prisma.teamMessage.findMany({
    where,
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
    // Preenchido = conversa direta com esta pessoa (setorId então precisa ser null).
    destinatarioId: z.string().nullable().optional(),
    text: z.string().max(4096).optional(),
    media: mediaSchema.optional(),
  })
  .refine((v) => (v.text && v.text.trim().length > 0) || v.media, {
    message: "mensagem precisa de texto ou anexo",
  })
  .refine((v) => !(v.destinatarioId && v.setorId), {
    message: "conversa direta não tem setor",
  });

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const destinatarioId = parsed.data.destinatarioId ?? null;
  if (destinatarioId) {
    if (!(await colegaValido(user, destinatarioId))) {
      return NextResponse.json({ error: "colega não encontrado" }, { status: 404 });
    }
  } else if (!podeVerCanal(user.role, await meusSetorIds(user.id), parsed.data.setorId)) {
    return NextResponse.json({ error: "sem acesso a este canal" }, { status: 403 });
  }

  const mensagem = await prisma.teamMessage.create({
    data: {
      tenantId: user.tenantId,
      setorId: parsed.data.setorId,
      destinatarioId,
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

  // Best-effort: nunca atrasa nem quebra o envio (avisarNoCelular engole a
  // própria falha).
  void avisar({
    tenantId: user.tenantId,
    setorId: parsed.data.setorId,
    destinatarioId,
    autorId: user.id,
    autorNome: user.name,
    corpo: parsed.data.text?.trim() || (parsed.data.media ? "enviou um anexo" : ""),
  });

  return NextResponse.json(mensagem, { status: 201 });
}

async function avisar({
  tenantId,
  setorId,
  destinatarioId,
  autorId,
  autorNome,
  corpo,
}: {
  tenantId: string;
  setorId: string | null;
  destinatarioId: string | null;
  autorId: string;
  autorNome: string;
  corpo: string;
}) {
  // Direta: só a outra pessoa é avisada, e o título é só o nome de quem
  // escreveu — não existe "canal" pra citar.
  if (destinatarioId) {
    await avisarNoCelular(destinatarioId, {
      titulo: autorNome,
      corpo,
      url: "/chat-equipe",
      tag: `chat-equipe-direta-${autorId}`,
    });
    return;
  }

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
        : {}),
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
