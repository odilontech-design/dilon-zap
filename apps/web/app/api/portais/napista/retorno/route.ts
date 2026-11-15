import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { urlBaseDaRequisicao } from "@/lib/portais-api";
import { concluirConexaoNapista } from "@/lib/portais-napista";

/** O NaPista devolve a pessoa para cá com o código; o "state" assinado garante que o pedido saiu daqui, da mesma empresa e da mesma pessoa. */
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const base = urlBaseDaRequisicao(req);
  const voltar = (q: string) => NextResponse.redirect(`${base}/veiculos/portais?${q}`);
  if (url.searchParams.get("error")) return voltar("napista=negada");
  const code = url.searchParams.get("code");
  if (!code) return voltar("napista=invalida");
  const r = await concluirConexaoNapista(code, url.searchParams.get("state") ?? "", base, { tenantId: user.tenantId, userId: user.id });
  if (!r.ok) return voltar(`napista=${r.motivo}`);
  await logAudit({ actor: user, action: "portais.napista.conectar" });
  return voltar("napista=conectada");
}
