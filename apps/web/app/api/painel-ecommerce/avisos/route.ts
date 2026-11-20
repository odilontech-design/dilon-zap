import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { chamarAvisos, ErroDoPainel, motivoDePeriodoInvalido } from "@/lib/painel-ecommerce";
import { ErroDeConfiguracao, lerConfigDoPainel } from "@/lib/painel-ecommerce-config";

/**
 * GET /api/painel-ecommerce/avisos?de=&ate=[&canal=EMAIL|WHATSAPP][&status=FALHOU]
 * Os avisos que o site mandou às clientes (e-mail e WhatsApp), lidos do site pelo servidor: quando, para quem,
 * assunto, texto e o motivo da falha. Só a gestão. Sem cache: é a lista que a gestão abre para conferir agora.
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
  const canal = q.get("canal");
  const status = q.get("status");

  try {
    const cfg = await lerConfigDoPainel(user.tenantId);
    if (!cfg) return NextResponse.json({ error: "O painel do site ainda não foi configurado para esta empresa.", naoConfigurado: true }, { status: 409 });
    const avisos = await chamarAvisos(cfg, de!, ate!, {
      canal: canal === "EMAIL" || canal === "WHATSAPP" ? canal : undefined,
      status: status === "ENVIADO" || status === "FALHOU" || status === "PULADO" ? status : undefined,
    });
    return NextResponse.json({ avisos });
  } catch (e) {
    if (e instanceof ErroDoPainel || e instanceof ErroDeConfiguracao) return NextResponse.json({ error: e.message }, { status: e.status === 400 ? 400 : 502 });
    throw e;
  }
}
