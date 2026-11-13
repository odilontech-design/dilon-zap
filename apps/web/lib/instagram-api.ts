import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";

/** Quem usa a caixa do Instagram: a equipe da loja (recurso Veículos). `gerencia` ainda vale para conectar e desconectar. */
export async function equipe(gerencia = false) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return { bloqueio };
  if (gerencia && !ehGerencia(user.role)) return { bloqueio: NextResponse.json({ error: "só a gestão conecta o Instagram" }, { status: 403 }) };
  return { user };
}

export const urlBaseDaRequisicao = (req: Request) => (process.env.NEXTAUTH_URL ?? new URL(req.url).origin).replace(/\/$/, "");
