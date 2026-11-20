import { prisma } from "@dilon-zap/db";

/**
 * Exclusão de contatos em lote (reunião Believe, 06/11: "limpar o CRM":
 * tirar da base os contatos inativos, com a Camila).
 *
 * O banco apaga em cascata tudo que pende do contato: conversas e mensagens,
 * mas TAMBÉM pedidos, contas a receber, ordens de serviço, receitas, vendas de
 * veículo e negociações. Numa limpeza em massa isso é o perigo: um contato que
 * parece "inativo" na lista pode ter o histórico de compra de um cliente. Por
 * isso o lote só apaga quem não tem nada disso, e uma conversa ABERTA também
 * segura o contato (alguém ainda está atendendo).
 *
 * Quem fica de fora volta na resposta com o motivo, para a tela mostrar.
 */

export const LIMITE_LOTE = 500;

export type ContatoIgnorado = { id: string; nome: string | null; motivo: string };

export type ResultadoLote = {
  excluidos: number;
  ignorados: ContatoIgnorado[];
};

type Vinculos = {
  _count: {
    orders: number;
    contasReceber: number;
    negociacoes: number;
    receitasOticas: number;
    ordensServico: number;
    comprasDeVeiculo: number;
    veiculosConsignados: number;
  };
  conversasAbertas: number;
};

/** O motivo de um contato não poder ser apagado em lote, ou null se pode. Puro, para teste. */
export function motivoDeNaoExcluir(v: Vinculos): string | null {
  const c = v._count;
  if (c.orders > 0) return "tem pedidos";
  if (c.contasReceber > 0) return "tem contas a receber";
  if (c.negociacoes > 0) return "tem negociação no funil";
  if (c.ordensServico > 0 || c.receitasOticas > 0) return "tem ordem de serviço ou receita";
  if (c.comprasDeVeiculo > 0 || c.veiculosConsignados > 0) return "tem veículo ligado a ele";
  if (v.conversasAbertas > 0) return "tem conversa em aberto";
  return null;
}

export async function excluirContatosEmLote(tenantId: string, ids: string[]): Promise<ResultadoLote> {
  const unicos = [...new Set(ids)].slice(0, LIMITE_LOTE);

  // O tenantId no where é o que impede um id de outra empresa de entrar: ele simplesmente não aparece aqui.
  const contatos = await prisma.contact.findMany({
    where: { id: { in: unicos }, tenantId, grupo: false },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      _count: {
        select: {
          orders: true,
          contasReceber: true,
          negociacoes: true,
          receitasOticas: true,
          ordensServico: true,
          comprasDeVeiculo: true,
          veiculosConsignados: true,
        },
      },
      conversations: { where: { status: { in: ["OPEN", "PENDING"] } }, select: { id: true }, take: 1 },
    },
  });

  const podem: string[] = [];
  const ignorados: ContatoIgnorado[] = [];
  for (const c of contatos) {
    const motivo = motivoDeNaoExcluir({ _count: c._count, conversasAbertas: c.conversations.length });
    if (motivo) ignorados.push({ id: c.id, nome: c.name ?? c.phoneNumber, motivo });
    else podem.push(c.id);
  }

  // Ids que não vieram na consulta (de outra empresa, de grupo ou que já não existem).
  const achados = new Set(contatos.map((c) => c.id));
  for (const id of unicos) if (!achados.has(id)) ignorados.push({ id, nome: null, motivo: "não encontrado" });

  let excluidos = 0;
  if (podem.length > 0) {
    const r = await prisma.contact.deleteMany({ where: { id: { in: podem }, tenantId } });
    excluidos = r.count;
  }
  return { excluidos, ignorados };
}
