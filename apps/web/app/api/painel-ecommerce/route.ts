import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { buscarPainel, ErroDoPainel, motivoDePeriodoInvalido } from "@/lib/painel-ecommerce";
import { ErroDeConfiguracao, lerConfigDoPainel } from "@/lib/painel-ecommerce-config";

/**
 * GET /api/painel-ecommerce?de=AAAA-MM-DD&ate=AAAA-MM-DD — os números da loja online da empresa, lidos do site
 * dela pelo servidor (a chave não sai daqui). Só a gestão. Cache de 5 minutos; se o site cair, devolve o último
 * resultado com `origem: "reserva"` e o motivo, para a tela avisar em vez de quebrar.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "PAINEL_ECOMMERCE");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão vê o painel do site" }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const de = q.get("de");
  const ate = q.get("ate");
  const motivo = motivoDePeriodoInvalido(de, ate);
  if (motivo) return NextResponse.json({ error: motivo }, { status: 400 });

  try {
    const cfg = await lerConfigDoPainel(user.tenantId);
    if (!cfg) return NextResponse.json({ error: "O painel do site ainda não foi configurado para esta empresa. Peça à Dilon Tech.", naoConfigurado: true }, { status: 409 });
    const r = await buscarPainel({ tenantId: user.tenantId, ...cfg }, de!, ate!);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroDoPainel || e instanceof ErroDeConfiguracao) return NextResponse.json({ error: e.message }, { status: e.status === 400 ? 400 : 502 });
    throw e;
  }
}
