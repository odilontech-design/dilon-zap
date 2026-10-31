import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser, type CurrentUser } from "@/lib/session";
import { recursosDoTenant } from "@/lib/plano";
import { podeSdr, type NivelSdr } from "./regras";
import { ErroSdr, repositorioSdr } from "./repositorio";

/**
 * O portão de todas as rotas e telas do SDR.
 *
 * Não usa exigirRecurso, que deixa o SUPERADMIN passar em qualquer empresa: aqui
 * o recurso precisa estar ligado na empresa da sessão, seja qual for o papel.
 * O papel é lido do banco porque o do JWT só muda no próximo login, e tirar o
 * acesso de alguém não pode esperar por isso.
 */
export type AcessoSdr =
  | { ok: true; user: CurrentUser; podeEscrever: boolean; repo: ReturnType<typeof repositorioSdr> }
  | { ok: false; status: 403; erro: string };

export async function verificarAcessoSdr(nivel: NivelSdr): Promise<AcessoSdr> {
  const user = await requireUser();
  const [atual, recursos] = await Promise.all([
    prisma.user.findFirst({ where: { id: user.id, tenantId: user.tenantId, deactivatedAt: null }, select: { role: true } }),
    recursosDoTenant(user.tenantId),
  ]);
  if (!recursos.has("SDR")) return { ok: false, status: 403, erro: "o SDR não está disponível para esta empresa" };
  if (!atual || !podeSdr(atual.role, nivel)) return { ok: false, status: 403, erro: "seu perfil não tem acesso a esta ação do SDR" };
  return { ok: true, user, podeEscrever: podeSdr(atual.role, "escrever"), repo: repositorioSdr(user.tenantId) };
}

export function respostaDeErro(e: unknown) {
  if (e instanceof ErroSdr) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export const recusa = (a: Extract<AcessoSdr, { ok: false }>) => NextResponse.json({ error: a.erro }, { status: a.status });

export const dadosInvalidos = () => NextResponse.json({ error: "confira os dados informados" }, { status: 400 });
