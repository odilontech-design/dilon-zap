import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import {
  recursosEfetivos,
  limiteDeAtendentes,
  ROTULO_RECURSO,
  PLANOS,
  type Recurso,
  type Assinatura,
} from "./plano-regras";

/**
 * Onde o plano é aplicado de verdade: no servidor.
 *
 * Esconder um item do menu não bloqueia nada — a rota continua respondendo a
 * quem souber o endereço, e o bloqueio vira sugestão. Por isso a regra mora
 * aqui e é chamada pelas rotas; a tela só esconde pra ninguém esbarrar numa
 * recusa.
 */

async function carregarAssinatura(tenantId: string) {
  const [assinatura, excecoes] = await Promise.all([
    prisma.subscription.findUnique({
      where: { tenantId },
      select: { plano: true, plataformaCompleta: true },
    }),
    prisma.tenantRecurso.findMany({
      where: { tenantId },
      select: { recurso: true, ativo: true },
    }),
  ]);
  return { assinatura: assinatura as Assinatura, excecoes };
}

export async function recursosDoTenant(tenantId: string) {
  const { assinatura, excecoes } = await carregarAssinatura(tenantId);
  return recursosEfetivos(assinatura, excecoes);
}

/**
 * Barra a rota se o recurso não está no plano.
 *
 * Devolve a resposta pronta em vez de lançar exceção: o chamador faz
 * `if (bloqueio) return bloqueio`, e fica visível na rota que existe um
 * portão ali. Um throw escondido transformaria "fora do plano" num erro 500.
 *
 * SUPERADMIN passa sempre: a Dilon Tech precisa entrar numa conta pra dar
 * suporte sem antes mudar o plano do cliente.
 */
export async function exigirRecurso(
  user: { tenantId: string; role: string },
  recurso: Recurso
): Promise<NextResponse | null> {
  if (user.role === "SUPERADMIN") return null;

  const ativos = await recursosDoTenant(user.tenantId);
  if (ativos.has(recurso)) return null;

  return NextResponse.json(
    {
      error: `${ROTULO_RECURSO[recurso]} não faz parte do plano desta empresa. Fale com a Dilon Tech para incluir.`,
      recurso,
      foraDoPlano: true,
    },
    { status: 403 }
  );
}

/**
 * Se ainda cabe mais um atendente ativo.
 *
 * Conta só quem está ativo: desativar alguém tem que liberar a vaga, senão
 * uma empresa que trocou de funcionário ficaria travada pra sempre.
 */
export async function vagaDeAtendente(tenantId: string) {
  const { assinatura } = await carregarAssinatura(tenantId);
  const limite = limiteDeAtendentes(assinatura);

  const ativos = await prisma.user.count({
    where: { tenantId, deactivatedAt: null, role: { not: "SUPERADMIN" } },
  });

  return {
    cabe: limite === null || ativos < limite,
    ativos,
    limite,
    plano: assinatura ? PLANOS[assinatura.plano].nome : null,
  };
}
