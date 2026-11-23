import { prisma, type Prisma } from "@dilon-zap/db";
import { numeroOS } from "@/lib/otica-regras";

export class ErroDeData extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** "AAAA-MM-DD" que existe no calendário, entre 2000 e amanhã (relógio de Brasília). */
export function validarDiaDoTalao(dia: string, agora = new Date()): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new ErroDeData("data inválida");
  const d = new Date(`${dia}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia) throw new ErroDeData("essa data não existe no calendário");
  if (d.getUTCFullYear() < 2000) throw new ErroDeData("data muito antiga: confira o ano");
  if (d.getTime() > agora.getTime() + 36 * 3_600_000) throw new ErroDeData("a data não pode estar no futuro");
  return d;
}

/**
 * Corrige a data de uma OS do papel (a leitura por IA erra ano e mês, e a data errada
 * vai parar no Histórico, nos gráficos e no Financeiro).
 *
 * A data do talão vive em quatro lugares, e os quatro mudam juntos, senão o Histórico e o
 * Financeiro passam a contar histórias diferentes:
 *  - a OS: data de entrega, de criação e, se havia previsão, a previsão;
 *  - o vencimento da parcela da conta do talão;
 *  - a data em que o pagamento do talão foi recebido.
 *
 * O Caixa não muda: ele recorta pelo momento em que o pagamento foi LANÇADO no sistema, e não
 * pela data do talão — corrigir o ano não move dinheiro entre caixas.
 */
export async function corrigirDataNaTransacao(tx: Prisma.TransactionClient, tenantId: string, ordemId: string, dia: string, agora = new Date()) {
  const novo = validarDiaDoTalao(dia, agora);

  const ordem = await tx.ordemServico.findFirst({
    where: { id: ordemId, tenantId },
    select: { id: true, numero: true, historica: true, etapa: true, entregueEm: true, previsaoEntrega: true, contaId: true },
  });
  if (!ordem) throw new ErroDeData("OS não encontrada", 404);
  if (!ordem.historica) throw new ErroDeData("só a data de OS do papel se corrige aqui; as feitas no sistema seguem as etapas", 409);
  if (ordem.etapa === "CANCELADA") throw new ErroDeData("OS cancelada não pode ser editada", 409);

  await tx.ordemServico.update({
    where: { id: ordem.id },
    data: {
      entregueEm: novo,
      etapaDesde: novo,
      createdAt: novo,
      ...(ordem.previsaoEntrega ? { previsaoEntrega: novo } : {}),
    },
  });

  let financeiro = false;
  if (ordem.contaId) {
    // Só a conta que o próprio talão criou: uma conta lançada à mão não é tocada.
    const conta = await tx.contaReceber.findFirst({
      where: { id: ordem.contaId, tenantId, descricao: { contains: "(talão antigo)" } },
      select: { id: true },
    });
    if (conta) {
      await tx.parcela.updateMany({ where: { contaId: conta.id }, data: { vencimento: novo } });
      await tx.pagamento.updateMany({
        where: { contaId: conta.id, observacao: { startsWith: `OS ${numeroOS(ordem.numero)}: talão antigo` } },
        data: { recebidoEm: novo },
      });
      financeiro = true;
    }
  }

  return { numero: ordem.numero, de: ordem.entregueEm ? ordem.entregueEm.toISOString().slice(0, 10) : null, para: dia, financeiro };
}

export async function corrigirDataDaOSHistorica(tenantId: string, ordemId: string, dia: string, agora = new Date()) {
  return prisma.$transaction((tx) => corrigirDataNaTransacao(tx, tenantId, ordemId, dia, agora));
}
