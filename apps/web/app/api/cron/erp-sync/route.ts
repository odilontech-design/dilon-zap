import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { sincronizarTodos } from "@/lib/erp-sync";

/**
 * Varredura do ERP: suspende quem está inadimplente e reativa quem regularizou.
 * Chamada por cron da VM com `Authorization: Bearer $CRON_SECRET`.
 */
const h = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET ?? "";
  if (segredo.length < 16) return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 503 });
  const enviado = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(h(enviado), h(segredo))) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const resultados = await sincronizarTodos();
  return NextResponse.json({
    total: resultados.length,
    suspensos: resultados.filter((r) => r.acao === "SUSPENDER" && !r.erro).length,
    reativados: resultados.filter((r) => r.acao === "REATIVAR" && !r.erro).length,
    erros: resultados.filter((r) => r.erro).map((r) => ({ tenantId: r.tenantId, erro: r.erro })),
  });
}
