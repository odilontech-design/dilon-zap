"use server";

import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/session";
import { sincronizarFaturas } from "@/lib/cobranca";
import type { Resultado } from "@/lib/acoes";

/**
 * Atualizar situação / gerar boleto. Fica fora do `acaoDeAdmin` de propósito:
 * é a ação que o administrador BLOQUEADO precisa para ver que já pagou.
 */
export async function atualizarAssinatura(): Promise<Resultado> {
  const u = await usuarioAtual();
  if (!u || u.papel !== "ADMIN") return { ok: false, erro: "Sem permissão." };
  const r = await sincronizarFaturas(u.empresaId);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true } : { ok: false, erro: r.erro ?? "Não foi possível atualizar." };
}
