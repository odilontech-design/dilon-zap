import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";

/** Quem mexe nos portais: a gestão da loja (recurso Veículos). */
export async function gestaoDosPortais() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return { bloqueio };
  if (!ehGerencia(user.role)) return { bloqueio: NextResponse.json({ error: "só a gestão cuida dos portais" }, { status: 403 }) };
  return { user };
}

export const urlBaseDaRequisicao = (req: Request) => (process.env.NEXTAUTH_URL ?? new URL(req.url).origin).replace(/\/$/, "");
