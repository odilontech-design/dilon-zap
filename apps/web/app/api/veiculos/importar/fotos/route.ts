import { NextResponse } from "next/server";
import { isStorageConfigured } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { baixarFotosPendentes, fotosPendentes } from "@/lib/veiculos";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

/** Quantas fotos da importação ainda faltam baixar. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();
  return NextResponse.json({ restantes: await fotosPendentes(user.tenantId) });
}

/** Baixa o próximo lote. A tela chama de novo até `restantes` chegar a zero. */
export async function POST() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();
  if (!isStorageConfigured()) return NextResponse.json({ error: "Armazenamento de arquivos não configurado." }, { status: 503 });
  return NextResponse.json(await baixarFotosPendentes(user.tenantId, user.id));
}
