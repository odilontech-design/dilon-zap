import { prisma } from "@dilon-zap/db";
import type { CurrentUser } from "@/lib/session";

/**
 * Por qual número a empresa envia.
 *
 * Existe porque a Guttierres separou uma linha só pro financeiro. Antes cada
 * rota pegava "o número do tenant" com um findFirst solto, e todas assumiam
 * que só havia um. Com dois, cada findFirst desses manda pelo número errado
 * EM SILÊNCIO — ninguém percebe até um cliente estranhar de qual número veio
 * a mensagem. Por isso a escolha mora num lugar só, com nome e teste.
 */

export type NumeroParaEnvio = { id: string; setorId: string | null };

/**
 * Qual número usar, dada a lista de números da empresa e os setores da pessoa.
 *
 * Puro pra ter teste: a regra é o que erra, e o erro é mudo.
 *
 * Ordem: o número do setor de quem está enviando ganha; na falta dele, o
 * número geral (sem setor); na falta dos dois, o primeiro que existir — é
 * melhor enviar por um número torto do que não enviar, porque "não enviou"
 * o atendente vê na hora e "enviou pelo outro" ninguém vê.
 */
export function escolherNumero(
  numeros: NumeroParaEnvio[],
  setorIdsDoUsuario: string[]
): NumeroParaEnvio | null {
  if (numeros.length === 0) return null;

  const doMeuSetor = numeros.find((n) => n.setorId && setorIdsDoUsuario.includes(n.setorId));
  if (doMeuSetor) return doMeuSetor;

  return numeros.find((n) => !n.setorId) ?? numeros[0];
}

/**
 * O número por onde ESTE usuário envia agora.
 *
 * Só sessões que não estão deslogadas: mandar por uma linha morta enfileira
 * mensagem que nunca sai.
 */
export async function numeroParaEnviar(user: CurrentUser) {
  const [numeros, membros] = await Promise.all([
    prisma.whatsAppSession.findMany({
      where: { tenantId: user.tenantId, status: { not: "LOGGED_OUT" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, setorId: true },
    }),
    prisma.setorMembro.findMany({ where: { userId: user.id }, select: { setorId: true } }),
  ]);

  return escolherNumero(numeros, membros.map((m) => m.setorId));
}

/**
 * O número geral da empresa — o que não pertence a setor nenhum.
 *
 * Pra quem envia sem ser uma pessoa logada: grupo (não é de um setor),
 * integração externa (o sistema de fora não sabe de setor) e o painel, que só
 * mostra status.
 *
 * O `orderBy` é por createdAt ASC de propósito. Antes cada rota usava DESC e
 * pegava o número MAIS NOVO; no dia em que a empresa conectasse uma segunda
 * linha, todas elas passariam a enviar por ela sem ninguém pedir — a falha
 * mais cara deste recurso, porque é muda.
 */
export async function numeroGeral(tenantId: string) {
  const numeros = await prisma.whatsAppSession.findMany({
    where: { tenantId, status: { not: "LOGGED_OUT" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, setorId: true, status: true, phoneNumber: true },
  });
  return numeros.find((n) => !n.setorId) ?? numeros[0] ?? null;
}
