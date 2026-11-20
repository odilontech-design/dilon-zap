import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { lojasComEspelho, registrarFalhaDoEspelho, sincronizarComSite } from "@/lib/espelho-do-site";

/**
 * Espelho do site atual das lojas de revenda: traz carro novo e esconde da
 * vitrine o que saiu do site antigo. Chamada por cron da VM, de hora em hora:
 *   0 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-ZAP/api/cron/sincronizar-sites
 * Uma loja com problema (site fora do ar) não atrapalha as outras.
 */
const h = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET ?? "";
  if (segredo.length < 16) return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  const enviado = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(h(enviado), h(segredo))) return NextResponse.json({ error: "não autorizado" }, { status: 401 });

  const lojas = await lojasComEspelho();
  const erros: { tenantId: string; erro: string }[] = [];
  let novos = 0;
  let sumiram = 0;
  for (const tenantId of lojas) {
    try {
      const r = await sincronizarComSite({ tenantId, userId: null });
      novos += r.novos;
      sumiram += r.sumiram;
    } catch (e) {
      const erro = e instanceof Error ? e.message : "falha";
      erros.push({ tenantId, erro });
      await registrarFalhaDoEspelho(tenantId, erro).catch(() => {});
    }
  }
  return NextResponse.json({ lojas: lojas.length, novos, sumiram, erros });
}
