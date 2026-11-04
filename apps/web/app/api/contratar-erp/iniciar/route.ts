import { NextResponse } from "next/server";
import { esquemaDoPedido } from "@/lib/erp-contratacao";
import { contratacaoDisponivel, iniciarContratacao } from "@/lib/erp-contratacao-servico";
import { criarLimitador, enderecoDoPedido } from "@/lib/limite-de-pedidos";

/**
 * Pública e grava no banco, como /api/cadastro, então tem as mesmas barreiras: campo-armadilha, teto por
 * endereço e por e-mail. Aqui o pedido só vira escritório depois de a pessoa confirmar o e-mail.
 */
const porEndereco = criarLimitador(5, 60 * 60 * 1000);
const porEmail = criarLimitador(3, 60 * 60 * 1000);

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  // Armadilha: robô que preenche tudo cai aqui e recebe um "sucesso" que não fez nada.
  if (corpo && typeof corpo === "object" && typeof (corpo as { website?: unknown }).website === "string" && (corpo as { website: string }).website.trim() !== "") return NextResponse.json({ ok: true });

  const ip = enderecoDoPedido(req);
  if (porEndereco(ip)) return NextResponse.json({ error: "Muitos pedidos deste dispositivo. Tente de novo mais tarde." }, { status: 429 });
  if (!contratacaoDisponivel()) return NextResponse.json({ error: "A contratação online está indisponível no momento. Fale com a Dilon Tech." }, { status: 503 });

  const v = esquemaDoPedido.safeParse(corpo);
  if (!v.success) return NextResponse.json({ error: v.error.issues[0]?.message ?? "Confira os dados e tente de novo." }, { status: 400 });
  if (porEmail(v.data.email)) return NextResponse.json({ error: "Muitos pedidos para este e-mail. Tente de novo mais tarde." }, { status: 429 });

  const r = await iniciarContratacao(v.data, { ip: ip === "desconhecido" ? null : ip.slice(0, 64), userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json({ ok: true });
}
