import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, registrarMarcacao } from "@dilon-zap/ponto-db";
import { isStorageConfigured, uploadMedia } from "@dilon-zap/storage";
import { usuarioAtual } from "@/lib/session";
import { comprovanteDe } from "@/lib/comprovante";

export const dynamic = "force-dynamic";

const schema = z.object({
  idempotencia: z.string().min(8).max(80),
  canal: z.enum(["APP", "WEB"]),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  precisaoM: z.number().min(0).max(100_000).nullish(),
  /** data URL da selfie (image/jpeg) */
  foto: z.string().max(600_000).nullish(),
  offline: z.boolean().optional(),
  instanteDispositivo: z.string().datetime().nullish(),
});

/** Marcação feita sem internet só vale se chegar em até 72 horas. */
const PRAZO_OFFLINE_MS = 72 * 3600_000;
const TOLERANCIA_RELOGIO_MS = 2 * 60_000;

/**
 * Registro de ponto do próprio colaborador.
 *
 * Nada aqui IMPEDE a marcação por falta de foto ou de localização: a Portaria
 * 671 não admite restringir o registro. O que falta vira motivo de revisão,
 * que aparece para o administrador no controle de ponto.
 */
export async function POST(req: Request) {
  const u = await usuarioAtual();
  if (!u || !u.colaboradorId) return NextResponse.json({ error: "Entre de novo para bater o ponto." }, { status: 401 });

  let corpo: z.infer<typeof schema>;
  try {
    corpo = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados da marcação inválidos." }, { status: 400 });
  }

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: u.colaboradorId, empresaId: u.empresaId, ativo: true },
    include: { empresa: { select: { exigirLocalizacao: true } } },
  });
  if (!colaborador) return NextResponse.json({ error: "Colaborador inativo." }, { status: 403 });

  const revisar: string[] = [];
  const temLocal = corpo.latitude != null && corpo.longitude != null;
  if (colaborador.empresa.exigirLocalizacao && !temLocal) revisar.push("sem localização");

  // Offline: vale a hora do aparelho, dentro de limites. Fora deles, a hora do servidor.
  let instanteForcado: Date | undefined;
  let instanteDispositivo: Date | null = null;
  if (corpo.offline && corpo.instanteDispositivo) {
    instanteDispositivo = new Date(corpo.instanteDispositivo);
    const atraso = Date.now() - instanteDispositivo.getTime();
    if (atraso >= -TOLERANCIA_RELOGIO_MS && atraso <= PRAZO_OFFLINE_MS) {
      instanteForcado = instanteDispositivo;
      revisar.push("feita sem internet");
    } else {
      revisar.push("hora do aparelho fora do prazo, valeu a hora do envio");
    }
  }

  let fotoChave: string | null = null;
  let fotoBytes: { mime: string; bytes: Buffer } | null = null;
  if (corpo.foto) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(corpo.foto);
    if (!m) return NextResponse.json({ error: "Foto em formato inválido." }, { status: 400 });
    const bytes = Buffer.from(m[2], "base64");
    if (isStorageConfigured()) {
      fotoChave = `ponto/${u.empresaId}/${colaborador.id}/${corpo.idempotencia}.jpg`;
      await uploadMedia(fotoChave, bytes, m[1]);
    } else {
      fotoBytes = { mime: m[1], bytes };
    }
  } else if (colaborador.modoRegistro === "COM_FOTO") {
    revisar.push("sem foto");
  }

  const encaminhado = req.headers.get("x-forwarded-for");
  const { marcacao, repetida } = await registrarMarcacao({
    empresaId: u.empresaId,
    colaboradorId: colaborador.id,
    canal: corpo.canal,
    idempotencia: `${colaborador.id}:${corpo.idempotencia}`,
    latitude: corpo.latitude ?? null,
    longitude: corpo.longitude ?? null,
    precisaoM: corpo.precisaoM ?? null,
    offline: Boolean(instanteForcado),
    instanteDispositivo,
    instanteForcado,
    fotoChave,
    fotoBytes,
    revisar: revisar.length ? revisar.join("; ") : null,
    ip: encaminhado ? encaminhado.split(",")[0].trim() : null,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ repetida, comprovante: await comprovanteDe(marcacao.id) }, { status: repetida ? 200 : 201 });
}
