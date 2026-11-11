import { z } from "zod";
import type { UsuarioAtual } from "@/lib/session";
import { usuarioAtual } from "@/lib/session";

/** Resultado padrão das server actions: a tela mostra `erro` ou segue. */
export type Resultado<T = void> = { ok: true; dados?: T; mensagem?: string } | { ok: false; erro: string };

export class ErroDeAcao extends Error {}

/**
 * Envolve uma server action de administrador. Server action é endpoint
 * público: a checagem de sessão e papel precisa estar DENTRO dela, não só na
 * página que mostra o botão.
 */
export async function acaoDeAdmin<T>(fn: (u: UsuarioAtual) => Promise<T>): Promise<Resultado<T>> {
  const u = await usuarioAtual();
  if (!u || u.papel !== "ADMIN") return { ok: false, erro: "Sem permissão. Entre de novo como administrador." };
  try {
    const dados = await fn(u);
    return { ok: true, dados };
  } catch (err) {
    if (err instanceof ErroDeAcao) return { ok: false, erro: err.message };
    if (err instanceof z.ZodError) return { ok: false, erro: err.errors[0]?.message ?? "Dados inválidos." };
    if ((err as { code?: string }).code === "P2002") return { ok: false, erro: "Já existe um cadastro com esse valor." };
    console.error("[acao]", err);
    return { ok: false, erro: "Não foi possível salvar. Tente de novo." };
  }
}
