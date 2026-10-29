import { prisma, type Prisma } from "@dilon-zap/db";
import type { TipoCategoriaFinanceira } from "@prisma/client";

/**
 * Plano de contas (Believe, 29/10): cada conta a pagar, conta a receber e
 * despesa do caixa entra numa categoria, e o relatório soma por categoria.
 *
 * O plano de partida é o que a Licyanne mandou. Ele é criado na primeira vez
 * que a empresa abre o financeiro; depois disso é dela — pode renomear,
 * acrescentar e desativar.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export class ErroDeCategoria extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const GRUPO_RECEITAS = "Receitas";
export const NOME_VENDAS = "Vendas de mercadorias";

export const PLANO_PADRAO: { tipo: TipoCategoriaFinanceira; grupo: string; nome: string }[] = [
  { tipo: "RECEITA", grupo: GRUPO_RECEITAS, nome: NOME_VENDAS },
  { tipo: "RECEITA", grupo: GRUPO_RECEITAS, nome: "Serviços prestados" },
  { tipo: "DESPESA", grupo: "Custos variáveis", nome: "Compras para revenda" },
  { tipo: "DESPESA", grupo: "Custos variáveis", nome: "Fretes e comissões" },
  { tipo: "DESPESA", grupo: "Despesas fixas", nome: "Aluguel" },
  { tipo: "DESPESA", grupo: "Despesas fixas", nome: "Salários administrativos" },
  { tipo: "DESPESA", grupo: "Despesas fixas", nome: "Internet e sistemas" },
  { tipo: "DESPESA", grupo: "Tributos", nome: "DAS e outros impostos" },
  { tipo: "DESPESA", grupo: "Financeiras", nome: "Juros e tarifas bancárias" },
  { tipo: "DESPESA", grupo: "Investimentos", nome: "Máquinas e equipamentos" },
  { tipo: "DESPESA", grupo: "Empréstimos", nome: "Pagamento do principal" },
  { tipo: "DESPESA", grupo: "Sócios", nome: "Aportes e retiradas" },
];

export type Categoria = { id: string; tipo: TipoCategoriaFinanceira; grupo: string; nome: string; ordem: number; ativa: boolean };

const SELECT = { id: true, tipo: true, grupo: true, nome: true, ordem: true, ativa: true } as const;

/**
 * Cria o plano de partida na primeira vez. As contas que nasceram de pedido
 * vão para "Vendas de mercadorias" no mesmo passo — é o que elas são, e assim
 * o relatório já abre com as vendas no lugar certo.
 */
export async function garantirPlano(tenantId: string) {
  const qtd = await prisma.categoriaFinanceira.count({ where: { tenantId } });
  if (qtd > 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.categoriaFinanceira.createMany({
      data: PLANO_PADRAO.map((c, i) => ({ tenantId, ...c, ordem: (i + 1) * 10 })),
      skipDuplicates: true,
    });
    const vendas = await categoriaDeVendas(tx, tenantId);
    if (vendas) {
      await tx.contaReceber.updateMany({ where: { tenantId, origem: "PEDIDO", categoriaId: null }, data: { categoriaId: vendas } });
    }
  });
}

export async function listarCategorias(tenantId: string): Promise<Categoria[]> {
  await garantirPlano(tenantId);
  return prisma.categoriaFinanceira.findMany({ where: { tenantId }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: SELECT });
}

/** A categoria das vendas por pedido: a de nome "Vendas de mercadorias", se ainda estiver ativa. */
export async function categoriaDeVendas(db: Db, tenantId: string): Promise<string | null> {
  const c = await db.categoriaFinanceira.findFirst({
    where: { tenantId, tipo: "RECEITA", nome: NOME_VENDAS, ativa: true },
    select: { id: true },
  });
  return c?.id ?? null;
}

/**
 * Confere que a categoria é da empresa e do tipo certo (receita numa conta a
 * receber, despesa numa conta a pagar). Nulo/vazio = sem categoria.
 */
export async function validarCategoria(db: Db, tenantId: string, categoriaId: string | null | undefined, tipo: TipoCategoriaFinanceira) {
  if (!categoriaId) return null;
  const c = await db.categoriaFinanceira.findFirst({ where: { id: categoriaId, tenantId }, select: { id: true, tipo: true } });
  if (!c) throw new ErroDeCategoria("categoria não encontrada", 404);
  if (c.tipo !== tipo) throw new ErroDeCategoria(tipo === "RECEITA" ? "escolha uma categoria de receita" : "escolha uma categoria de despesa");
  return c.id;
}

export async function criarCategoria(tenantId: string, d: { tipo: TipoCategoriaFinanceira; grupo: string; nome: string }) {
  const grupo = d.grupo.trim();
  const nome = d.nome.trim();
  if (!grupo || !nome) throw new ErroDeCategoria("informe o grupo e o nome");
  const existente = await prisma.categoriaFinanceira.findFirst({
    where: { tenantId, grupo: { equals: grupo, mode: "insensitive" }, nome: { equals: nome, mode: "insensitive" } },
    select: { id: true, ativa: true },
  });
  if (existente) {
    if (existente.ativa) throw new ErroDeCategoria("essa categoria já existe", 409);
    return prisma.categoriaFinanceira.update({ where: { id: existente.id }, data: { ativa: true, tipo: d.tipo }, select: SELECT });
  }
  const ultima = await prisma.categoriaFinanceira.findFirst({ where: { tenantId }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  // Entra logo depois da última do mesmo grupo, para o relatório não espalhar o grupo.
  const doGrupo = await prisma.categoriaFinanceira.findFirst({ where: { tenantId, grupo }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  const ordem = doGrupo ? doGrupo.ordem + 1 : (ultima?.ordem ?? 0) + 10;
  return prisma.categoriaFinanceira.create({ data: { tenantId, tipo: d.tipo, grupo, nome, ordem }, select: SELECT });
}

export async function editarCategoria(tenantId: string, id: string, d: { grupo?: string; nome?: string; ativa?: boolean }) {
  const c = await prisma.categoriaFinanceira.findFirst({ where: { id, tenantId }, select: { id: true, grupo: true, nome: true } });
  if (!c) throw new ErroDeCategoria("categoria não encontrada", 404);
  const grupo = d.grupo?.trim() || c.grupo;
  const nome = d.nome?.trim() || c.nome;
  if (grupo !== c.grupo || nome !== c.nome) {
    const outra = await prisma.categoriaFinanceira.findFirst({
      where: { tenantId, id: { not: id }, grupo: { equals: grupo, mode: "insensitive" }, nome: { equals: nome, mode: "insensitive" } },
      select: { id: true },
    });
    if (outra) throw new ErroDeCategoria("já existe uma categoria com esse nome nesse grupo", 409);
  }
  return prisma.categoriaFinanceira.update({
    where: { id },
    data: { grupo, nome, ...(d.ativa !== undefined ? { ativa: d.ativa } : {}) },
    select: SELECT,
  });
}

/** Apaga se nunca foi usada; se já foi, só desativa — as contas antigas continuam dizendo onde entraram. */
export async function removerCategoria(tenantId: string, id: string) {
  const c = await prisma.categoriaFinanceira.findFirst({
    where: { id, tenantId },
    select: { id: true, _count: { select: { contasReceber: true, contasPagar: true, movimentos: true } } },
  });
  if (!c) throw new ErroDeCategoria("categoria não encontrada", 404);
  const usos = c._count.contasReceber + c._count.contasPagar + c._count.movimentos;
  if (usos > 0) {
    await prisma.categoriaFinanceira.update({ where: { id }, data: { ativa: false } });
    return { removida: false, desativada: true, usos };
  }
  await prisma.categoriaFinanceira.delete({ where: { id } });
  return { removida: true, desativada: false, usos: 0 };
}

/* ------------------------------------------------------------------ relatório */

export type LinhaDoRelatorio = {
  categoriaId: string | null;
  nome: string;
  ativa: boolean;
  realizadoCents: number;
  abertoCents: number;
};
export type GrupoDoRelatorio = {
  tipo: TipoCategoriaFinanceira;
  grupo: string;
  realizadoCents: number;
  abertoCents: number;
  categorias: LinhaDoRelatorio[];
};

const SEM = "Sem categoria";

/**
 * Soma por categoria num período.
 *
 * Realizado: o dinheiro que de fato entrou ou saiu no período — recebimentos
 * (pela data em que o dinheiro entrou), pagamentos a fornecedor (pela data em
 * que saiu) e despesas lançadas no caixa. Estorno entra negativo, como no
 * extrato.
 *
 * Em aberto: o que ainda falta receber/pagar das parcelas que vencem no
 * período. Junto com o realizado, mostra o mês inteiro: o que já foi e o que
 * ainda vem.
 *
 * Recebimento de pedido pago na hora (sem conta a receber) é venda: entra em
 * "Vendas de mercadorias".
 */
export async function relatorioPorCategoria(
  tenantId: string,
  janela: { instanteDe: Date; instanteAte: Date; diaDe: Date; diaAte: Date }
) {
  const categorias = await listarCategorias(tenantId);
  const vendas = categorias.find((c) => c.tipo === "RECEITA" && c.nome === NOME_VENDAS && c.ativa)?.id ?? null;
  const instantes = { gte: janela.instanteDe, lte: janela.instanteAte };
  const dias = { gte: janela.diaDe, lte: janela.diaAte };

  const [recebimentos, saidas, despesasCaixa, parcelasReceber, parcelasPagar] = await Promise.all([
    prisma.pagamento.findMany({
      where: { OR: [{ order: { tenantId } }, { conta: { tenantId } }], recebidoEm: instantes },
      select: { valorCents: true, orderId: true, conta: { select: { categoriaId: true, origem: true } } },
    }),
    prisma.saidaPagamento.findMany({
      where: { tenantId, pagoEm: instantes },
      select: { valorCents: true, conta: { select: { categoriaId: true } } },
    }),
    prisma.movimentoCaixa.findMany({
      where: { tenantId, tipo: "DESPESA", createdAt: instantes },
      select: { valorCents: true, categoriaId: true },
    }),
    prisma.parcela.findMany({
      where: { tenantId, vencimento: dias, canceladaEm: null, reembolsadaEm: null, conta: { canceladaEm: null } },
      select: { valorCents: true, pagamentos: { select: { valorCents: true } }, conta: { select: { categoriaId: true, origem: true } } },
    }),
    prisma.parcelaPagar.findMany({
      where: { tenantId, vencimento: dias, canceladaEm: null, reembolsadaEm: null, conta: { canceladaEm: null } },
      select: { valorCents: true, pagamentos: { select: { valorCents: true } }, conta: { select: { categoriaId: true } } },
    }),
  ]);

  // Chave: "RECEITA:<id>" / "DESPESA:<id>", e "RECEITA:" para sem categoria.
  const soma = new Map<string, { realizado: number; aberto: number }>();
  const add = (tipo: TipoCategoriaFinanceira, id: string | null, campo: "realizado" | "aberto", v: number) => {
    if (!v) return;
    const k = `${tipo}:${id ?? ""}`;
    const atual = soma.get(k) ?? { realizado: 0, aberto: 0 };
    atual[campo] += v;
    soma.set(k, atual);
  };
  const daReceita = (conta: { categoriaId: string | null; origem: string } | null) =>
    conta?.categoriaId ?? (!conta || conta.origem === "PEDIDO" ? vendas : null);
  const saldo = (p: { valorCents: number; pagamentos: { valorCents: number }[] }) =>
    Math.max(0, p.valorCents - p.pagamentos.reduce((s, x) => s + x.valorCents, 0));

  for (const r of recebimentos) add("RECEITA", daReceita(r.conta), "realizado", r.valorCents);
  for (const s of saidas) add("DESPESA", s.conta.categoriaId, "realizado", s.valorCents);
  for (const m of despesasCaixa) add("DESPESA", m.categoriaId, "realizado", m.valorCents);
  for (const p of parcelasReceber) add("RECEITA", daReceita(p.conta), "aberto", saldo(p));
  for (const p of parcelasPagar) add("DESPESA", p.conta.categoriaId, "aberto", saldo(p));

  // Monta os grupos na ordem do plano. Categoria inativa só aparece se teve movimento.
  const grupos: GrupoDoRelatorio[] = [];
  const doGrupo = (tipo: TipoCategoriaFinanceira, grupo: string) => {
    let g = grupos.find((x) => x.tipo === tipo && x.grupo === grupo);
    if (!g) {
      g = { tipo, grupo, realizadoCents: 0, abertoCents: 0, categorias: [] };
      grupos.push(g);
    }
    return g;
  };
  for (const tipo of ["RECEITA", "DESPESA"] as const) {
    for (const c of categorias.filter((x) => x.tipo === tipo)) {
      const v = soma.get(`${tipo}:${c.id}`);
      if (!c.ativa && !v) continue;
      const g = doGrupo(tipo, c.grupo);
      g.categorias.push({ categoriaId: c.id, nome: c.nome, ativa: c.ativa, realizadoCents: v?.realizado ?? 0, abertoCents: v?.aberto ?? 0 });
      g.realizadoCents += v?.realizado ?? 0;
      g.abertoCents += v?.aberto ?? 0;
    }
    const sem = soma.get(`${tipo}:`);
    if (sem) {
      const g = doGrupo(tipo, SEM);
      g.categorias.push({ categoriaId: null, nome: SEM, ativa: true, realizadoCents: sem.realizado, abertoCents: sem.aberto });
      g.realizadoCents += sem.realizado;
      g.abertoCents += sem.aberto;
    }
  }

  const total = (tipo: TipoCategoriaFinanceira, campo: "realizadoCents" | "abertoCents") =>
    grupos.filter((g) => g.tipo === tipo).reduce((s, g) => s + g[campo], 0);
  const receitas = { realizadoCents: total("RECEITA", "realizadoCents"), abertoCents: total("RECEITA", "abertoCents") };
  const despesas = { realizadoCents: total("DESPESA", "realizadoCents"), abertoCents: total("DESPESA", "abertoCents") };

  return {
    grupos,
    totais: {
      receitas,
      despesas,
      resultado: {
        realizadoCents: receitas.realizadoCents - despesas.realizadoCents,
        abertoCents: receitas.abertoCents - despesas.abertoCents,
      },
    },
  };
}
