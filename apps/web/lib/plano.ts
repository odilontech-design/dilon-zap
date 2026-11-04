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

/** Recursos que somem para o atendente quando a empresa liga pedidosSoGerencia. */
const SO_GERENCIA: Recurso[] = ["PEDIDOS", "CONTAS_RECEBER"];

async function atendenteSemPedidos(user: { tenantId: string; role: string }) {
  if (user.role !== "AGENT") return false;
  const t = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { pedidosSoGerencia: true } });
  return !!t?.pedidosSoGerencia;
}

/**
 * O que esta pessoa usa: o plano da empresa, menos Pedidos e Contas a receber
 * para o atendente da empresa que reservou isso ao Responsável e ao Financeiro.
 */
export async function recursosDoUsuario(user: { tenantId: string; role: string }) {
  const [ativos, semPedidos] = await Promise.all([recursosDoTenant(user.tenantId), atendenteSemPedidos(user)]);
  if (semPedidos) for (const r of SO_GERENCIA) ativos.delete(r);
  return ativos;
}

/**
 * Se a pessoa pode ver quanto o cliente deve (o selo "Deve R$"). Quem não
 * pode recebe a pendência como nula — o dado não sai do servidor.
 */
export async function podeVerPendencia(user: { tenantId: string; role: string }) {
  return !(await atendenteSemPedidos(user));
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

  const ativos = await recursosDoUsuario(user);
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
 * Como exigirRecurso, mas passa se a empresa tiver QUALQUER um dos recursos.
 *
 * Existe pro catálogo de Produtos, que serve a dois recursos: Pedidos (vender
 * pelo chat) e Materiais (mandar documento e vídeo do serviço). Quem tem só um
 * dos dois precisa do catálogo do mesmo jeito.
 */
export async function exigirAlgumRecurso(
  user: { tenantId: string; role: string },
  recursos: Recurso[]
): Promise<NextResponse | null> {
  if (user.role === "SUPERADMIN") return null;

  const ativos = await recursosDoUsuario(user);
  if (recursos.some((r) => ativos.has(r))) return null;

  return NextResponse.json(
    {
      error: `${recursos.map((r) => ROTULO_RECURSO[r]).join(" ou ")} não faz parte do plano desta empresa. Fale com a Dilon Tech para incluir.`,
      recurso: recursos[0],
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
