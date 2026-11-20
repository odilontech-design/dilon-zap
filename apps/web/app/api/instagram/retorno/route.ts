import { NextResponse } from "next/server";
import { lerEstado } from "@dilon-zap/portais";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { concluirConexaoInstagram } from "@/lib/instagram";
import { urlBaseDaRequisicao } from "@/lib/instagram-api";

/**
 * O Instagram devolve a pessoa para cá com o código. O "state" assinado garante
 * que o pedido saiu daqui, da mesma empresa e da mesma pessoa que está logada.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const base = urlBaseDaRequisicao(req);
  const voltar = (q: string) => NextResponse.redirect(`${base}/veiculos/instagram?${q}`);
  if (url.searchParams.get("error")) return voltar("ig=negada");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const estado = process.env.PORTAIS_CHAVE ? lerEstado(state, process.env.PORTAIS_CHAVE) : null;
  if (!code || !estado || estado.portal !== "INSTAGRAM" || estado.tenantId !== user.tenantId || estado.userId !== user.id) return voltar("ig=invalida");
  const r = await concluirConexaoInstagram(code, state, base);
  if (!r.ok) return voltar(`ig=${r.motivo}`);
  await logAudit({ actor: user, action: "instagram.conectar", metadata: { username: r.username } });
  return voltar(r.webhook ? "ig=conectada" : "ig=conectada-sem-webhook");
}
