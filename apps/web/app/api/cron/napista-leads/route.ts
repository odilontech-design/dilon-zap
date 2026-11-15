import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { buscarLeadsDoNapista, lojasComNapista, registrarFalhaDeLeadsNapista } from "@/lib/portais-napista";

/**
 * Busca os contatos de compradores no NaPista (a API deles é de consulta, não avisa) e
 * registra os novos no CRM. Chamada por cron da VM, a cada 10 minutos:
 *   a cada 10 minutos (minutos 0,10,20,30,40,50): curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-ZAP/api/cron/napista-leads
 * Uma loja com problema não atrapalha as outras.
 */
const h = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET ?? "";
  if (segredo.length < 16) return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  const enviado = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(h(enviado), h(segredo))) return NextResponse.json({ error: "não autorizado" }, { status: 401 });

  const lojas = await lojasComNapista();
  let novos = 0;
  const erros: { tenantId: string; erro: string }[] = [];
  for (const tenantId of lojas) {
    try {
      novos += (await buscarLeadsDoNapista(tenantId))?.novos ?? 0;
    } catch (e) {
      const erro = e instanceof Error ? e.message : "falha";
      erros.push({ tenantId, erro });
      await registrarFalhaDeLeadsNapista(tenantId, erro).catch(() => {});
    }
  }
  return NextResponse.json({ lojas: lojas.length, novos, erros });
}
