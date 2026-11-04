import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { podeVerCanal } from "@/lib/team-chat";
import { avisarNoCelular } from "@/lib/push";
import { chaveDoCanal, marcarCanalLido } from "@/lib/team-chat-leitura";
import { colegaPermitido, contextoDoChat, nomeParaLeitor, NOME_SUPORTE, usuarioDeSuporte } from "@/lib/suporte-chat";

/**
 * Setores de que o usuário faz parte — só o necessário pra checar UM canal,
 * não pra montar um WHERE de listagem inteira.
 */
async function meusSetorIds(userId: string): Promise<string[]> {
  const membros = await prisma.setorMembro.findMany({ where: { userId }, select: { setorId: true } });
  return membros.map((m) => m.setorId);
}

export async function GET(req: Request) {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const setorId = params.get("setorId") || null;
  const com = params.get("com") || null; // conversa direta com esta pessoa
  // O suporte (SUPERADMIN) lê o Geral e as conversas diretas de OUTRA empresa;
  // para os demais papéis o parâmetro não tem efeito.
  const ctx = contextoDoChat(user, params.get("empresa"));
  const suporte = await usuarioDeSuporte();

  let where;
  if (com) {
    if (!(await colegaPermitido(user, ctx, com))) {
      return NextResponse.json({ error: "colega não encontrado" }, { status: 404 });
    }
    // Só as mensagens entre nós dois, nos dois sentidos.
    where = {
      tenantId: ctx.tenantId,
      setorId: null,
      OR: [
        { authorId: user.id, destinatarioId: com },
        { authorId: com, destinatarioId: user.id },
      ],
    };
  } else {
    // Fora da própria empresa o suporte só alcança o Geral, nunca um setor.
    if (ctx.externo ? setorId !== null : !podeVerCanal(user.role, await meusSetorIds(user.id), setorId)) {
      return NextResponse.json({ error: "sem acesso a este canal" }, { status: 403 });
    }
    // destinatarioId nulo: sem isso o Geral misturaria as conversas diretas.
    where = { tenantId: ctx.tenantId, setorId, destinatarioId: null };
  }

  // Quem está com o canal aberto e a tela à vista já leu o que chegou: é o
  // que zera o contador de mensagens novas e acende o "Vista" para quem
  // escreveu. Só com ?marcar=1 — a tela manda isso apenas quando a aba está
  // visível, senão um chat esquecido aberto em segundo plano "leria" tudo.
  if (params.get("marcar") === "1") {
    await marcarCanalLido(user.id, chaveDoCanal(com ? null : setorId, com, ctx.externo ? ctx.tenantId : null));
  }

  const mensagens = await prisma.teamMessage.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });

  // Quem já viu as MINHAS mensagens: as leituras dos outros neste canal com
  // "lido até" depois do envio. Na conversa direta, a leitura do colega fica
  // na chave dm:<meu id> (é a conversa comigo, do ponto de vista dele).
  const leituras = await prisma.teamChatLeitura.findMany({
    where: com
      ? { userId: com, canal: chaveDoCanal(null, user.id) }
      : { canal: chaveDoCanal(setorId, null), userId: { not: user.id } },
    select: { userId: true, lidoAte: true },
  });
  const nomes = new Map(
    (
      await prisma.user.findMany({
        // O suporte mora em outra empresa, mas é quem pode ter visto a conversa.
        where: {
          id: { in: leituras.map((l) => l.userId) },
          OR: [{ tenantId: ctx.tenantId }, ...(suporte ? [{ id: suporte.id }] : [])],
        },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, nomeParaLeitor(user, u, suporte)])
  );

  return NextResponse.json(
    mensagens.map((m) => ({
      ...m,
      author: { id: m.author.id, name: nomeParaLeitor(user, m.author, suporte) },
      vistoPor:
        m.authorId === user.id && !m.isDeleted
          ? leituras.filter((l) => l.lidoAte >= m.createdAt && nomes.has(l.userId)).map((l) => nomes.get(l.userId)!)
          : undefined,
    }))
  );
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
    // Só vale para o SUPERADMIN: escreve na empresa indicada.
    empresaId: z.string().nullable().optional(),
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

  const ctx = contextoDoChat(user, parsed.data.empresaId);
  const suporte = await usuarioDeSuporte();
  const destinatarioId = parsed.data.destinatarioId ?? null;

  if (ctx.externo && !(await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { id: true } }))) {
    return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });
  }

  if (destinatarioId) {
    if (!(await colegaPermitido(user, ctx, destinatarioId))) {
      return NextResponse.json({ error: "colega não encontrado" }, { status: 404 });
    }
  } else if (ctx.externo ? parsed.data.setorId !== null : !podeVerCanal(user.role, await meusSetorIds(user.id), parsed.data.setorId)) {
    return NextResponse.json({ error: "sem acesso a este canal" }, { status: 403 });
  }

  const mensagem = await prisma.teamMessage.create({
    data: {
      tenantId: ctx.tenantId,
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
  // própria falha). Quem é de outra empresa e fala com o suporte, ou o próprio
  // suporte falando numa empresa, aparece sob o nome do canal.
  const eSuporteFalando = !!suporte && user.id === suporte.id && user.tenantId !== ctx.tenantId;
  void avisar({
    tenantId: ctx.tenantId,
    setorId: parsed.data.setorId,
    destinatarioId,
    autorId: user.id,
    autorNome: eSuporteFalando ? NOME_SUPORTE : user.name,
    corpo: parsed.data.text?.trim() || (parsed.data.media ? "enviou um anexo" : ""),
    paraOSuporte: !!suporte && destinatarioId === suporte.id && user.tenantId !== suporte.tenantId,
  });

  return NextResponse.json({ ...mensagem, author: { id: mensagem.author.id, name: nomeParaLeitor(user, mensagem.author, suporte) } }, { status: 201 });
}

async function avisar({
  tenantId,
  setorId,
  destinatarioId,
  autorId,
  autorNome,
  corpo,
  paraOSuporte,
}: {
  tenantId: string;
  setorId: string | null;
  destinatarioId: string | null;
  autorId: string;
  autorNome: string;
  corpo: string;
  paraOSuporte: boolean;
}) {
  // Direta: só a outra pessoa é avisada, e o título é só o nome de quem
  // escreveu — não existe "canal" pra citar.
  if (destinatarioId) {
    // O suporte atende várias empresas: o aviso diz de qual.
    const empresa = paraOSuporte ? (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }))?.name : null;
    await avisarNoCelular(destinatarioId, {
      titulo: empresa ? `${autorNome} · ${empresa}` : autorNome,
      corpo,
      url: paraOSuporte ? "/admin/suporte" : "/chat-equipe",
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
