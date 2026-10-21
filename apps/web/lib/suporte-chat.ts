import { prisma } from "@dilon-zap/db";
import type { CurrentUser } from "@/lib/session";

/**
 * Canal "Suporte Dilon Tech" do chat da equipe.
 *
 * Todo usuário de qualquer empresa pode escrever ao suporte (o SUPERADMIN da
 * Dilon Tech) e o suporte pode participar do canal Geral de cada empresa,
 * tudo sem criar usuário nem mexer no schema: a mensagem continua pertencendo
 * à empresa do cliente (TeamMessage.tenantId), só o autor/destinatário é o
 * usuário de suporte, que mora na empresa da Dilon Tech.
 *
 * O acesso entre empresas é estreito de propósito: o suporte alcança só o
 * Geral e as conversas diretas COM ELE — nunca os canais de setor nem a
 * conversa de duas pessoas da empresa.
 */

export const NOME_SUPORTE = "Suporte Dilon Tech";

export type Suporte = { id: string; tenantId: string };

let guardado: { valor: Suporte | null; ate: number } | null = null;

/** O SUPERADMIN ativo mais antigo. Memória curta: é consultado a cada mensagem. */
export async function usuarioDeSuporte(): Promise<Suporte | null> {
  const agora = Date.now();
  if (guardado && guardado.ate > agora) return guardado.valor;
  const u = await prisma.user.findFirst({
    where: { role: "SUPERADMIN", deactivatedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, tenantId: true },
  });
  guardado = { valor: u, ate: agora + 60_000 };
  return u;
}

export type Contexto = {
  /** Empresa onde a conversa mora. */
  tenantId: string;
  /** O SUPERADMIN falando numa empresa que não é a dele. */
  externo: boolean;
};

/**
 * Em qual empresa a requisição age. Só o SUPERADMIN muda de empresa (o
 * parâmetro `empresa`); para qualquer outro papel ele é ignorado, e é isso que
 * impede um atendente de ler o chat de outra empresa pela URL.
 */
export function contextoDoChat(user: Pick<CurrentUser, "role" | "tenantId">, empresa: string | null | undefined): Contexto {
  if (user.role === "SUPERADMIN" && empresa && empresa !== user.tenantId) return { tenantId: empresa, externo: true };
  return { tenantId: user.tenantId, externo: false };
}

/**
 * Com quem dá pra abrir conversa direta: colega ativo da empresa onde a
 * conversa mora, ou o suporte (para quem não é do suporte). Nunca eu mesmo.
 */
export async function colegaPermitido(user: CurrentUser, ctx: Contexto, colegaId: string): Promise<boolean> {
  if (colegaId === user.id) return false;
  const colega = await prisma.user.findFirst({
    where: { id: colegaId, deactivatedAt: null },
    select: { id: true, tenantId: true },
  });
  if (!colega) return false;
  if (colega.tenantId === ctx.tenantId) return true;
  if (user.role !== "SUPERADMIN") {
    const suporte = await usuarioDeSuporte();
    return !!suporte && suporte.id === colega.id;
  }
  return false;
}

/** Nome mostrado a quem lê: para os clientes, o suporte não tem rosto pessoal. */
export function nomeParaLeitor(
  leitor: Pick<CurrentUser, "role" | "tenantId">,
  autor: { id: string; name: string },
  suporte: Suporte | null
): string {
  if (suporte && autor.id === suporte.id && leitor.role !== "SUPERADMIN" && leitor.tenantId !== suporte.tenantId) return NOME_SUPORTE;
  return autor.name;
}
