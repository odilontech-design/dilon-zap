import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { urlBaseDaRequisicao } from "@/lib/portais-api";
import { concluirConexaoMercadoLivre } from "@/lib/portais-mercadolivre";

/** O Mercado Livre devolve a pessoa para cá com o código; o "state" assinado garante que o pedido saiu daqui, da mesma empresa e da mesma pessoa. */
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const base = urlBaseDaRequisicao(req);
  const voltar = (q: string) => NextResponse.redirect(`${base}/veiculos/portais?${q}`);
  if (url.searchParams.get("error")) return voltar("mercadolivre=negada");
  const code = url.searchParams.get("code");
  if (!code) return voltar("mercadolivre=invalida");
  const r = await concluirConexaoMercadoLivre(code, url.searchParams.get("state") ?? "", base, { tenantId: user.tenantId, userId: user.id });
  if (!r.ok) return voltar(`mercadolivre=${r.motivo}`);
  await logAudit({ actor: user, action: "portais.mercadolivre.conectar" });
  return voltar("mercadolivre=conectada");
}
