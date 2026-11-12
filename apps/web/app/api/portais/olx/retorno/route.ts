import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { chaveDoAmbiente, cifrar, credenciaisDoAmbiente, dadosDoUsuario, lerEstado, trocarCodigo } from "@dilon-zap/portais";
import { requireUser } from "@/lib/session";
import { segredoDosPortais } from "@/lib/portais";
import { logAudit } from "@/lib/audit";

/**
 * A OLX devolve a pessoa para cá com o código de autorização. O "state"
 * assinado garante que o pedido saiu daqui, da mesma empresa e da mesma
 * pessoa que está logada agora; sem isso, a conta de uma loja poderia ser
 * ligada na empresa de outra.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const base = (process.env.NEXTAUTH_URL ?? url.origin).replace(/\/$/, "");
  const voltar = (q: string) => NextResponse.redirect(`${base}/veiculos/portais?${q}`);

  const segredo = segredoDosPortais();
  const app = credenciaisDoAmbiente();
  if (!segredo || !app) return voltar("olx=nao-configurada");
  if (url.searchParams.get("error")) return voltar("olx=negada");

  const estado = lerEstado(url.searchParams.get("state") ?? "", segredo);
  if (!estado || estado.portal !== "OLX" || estado.tenantId !== user.tenantId || estado.userId !== user.id) return voltar("olx=invalida");
  const code = url.searchParams.get("code");
  if (!code) return voltar("olx=invalida");

  try {
    const token = await trocarCodigo(app, code);
    const dados = await dadosDoUsuario(token).catch(() => ({ nome: null, email: null }));
    const accessTokenCripto = cifrar(token, chaveDoAmbiente());
    const agora = new Date();
    await prisma.portalConta.upsert({
      where: { tenantId_portal: { tenantId: user.tenantId, portal: "OLX" } },
      create: { tenantId: user.tenantId, portal: "OLX", status: "CONECTADA", accessTokenCripto, contaNome: dados.nome, contaEmail: dados.email, conectadaEm: agora },
      update: { status: "CONECTADA", accessTokenCripto, contaNome: dados.nome, contaEmail: dados.email, erro: null, conectadaEm: agora },
    });
    await logAudit({ actor: user, action: "portais.olx.conectar", metadata: { conta: dados.email } });
    return voltar("olx=conectada");
  } catch (e) {
    console.error("[portais] retorno da OLX falhou:", e instanceof Error ? e.message : e);
    return voltar("olx=falhou");
  }
}
