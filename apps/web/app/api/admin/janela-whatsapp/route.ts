import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { medirJanela } from "@/lib/janela-whatsapp";

/**
 * Janela de 24 horas do WhatsApp por cliente (só leitura): quanto do que a loja envia sairia de graça na API oficial da Meta
 * e quanto exigiria modelo pago. Só para o super admin.
 */
export async function GET(req: Request) {
  await requireSuperAdmin();
  const dias = Number(new URL(req.url).searchParams.get("dias") ?? 30);
  return NextResponse.json({ dias, linhas: await medirJanela(dias) });
}
