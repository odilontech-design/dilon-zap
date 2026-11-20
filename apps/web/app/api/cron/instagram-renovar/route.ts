import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { renovarTokensInstagram } from "@/lib/instagram";

/**
 * Renova os tokens do Instagram (valem 60 dias; renova quando faltam menos de 20).
 * Chamada por cron da VM, uma vez por dia:
 *   0 5 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-ZAP/api/cron/instagram-renovar
 */
const h = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET ?? "";
  if (segredo.length < 16) return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  const enviado = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(h(enviado), h(segredo))) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  return NextResponse.json(await renovarTokensInstagram());
}
