import { prisma, type StatusFatura } from "@dilon-zap/ponto-db";
import { acharOuCriarCliente, asaasConfigurado, criarAssinaturaBoleto, ErroAsaas, linhaDigitavel, pagamentosDaAssinatura, type PagamentoAsaas } from "@/lib/asaas";
import { situacaoAssinatura, statusDaFatura, type SituacaoAssinatura } from "@/lib/cobranca-regras";
import { hojeNoFuso, somarDias } from "@/lib/datas";
import { PLANOS } from "@/lib/planos";

/** Dias de prazo depois do vencimento antes de bloquear o painel. */
export const TOLERANCIA_DIAS = Number(process.env.PONTO_TOLERANCIA_DIAS || 5);
/** Vencimento do primeiro boleto, em dias depois da contratação. */
const DIAS_PRIMEIRO_BOLETO = Number(process.env.PONTO_DIAS_PRIMEIRO_BOLETO || 3);

export async function situacaoDaEmpresa(empresaId: string): Promise<SituacaoAssinatura> {
  const e = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: {
      formaCobranca: true,
      canceladaEm: true,
      timezone: true,
      faturas: { select: { id: true, vencimento: true, status: true, valorCentavos: true, urlFatura: true } },
    },
  });
  return situacaoAssinatura({
    forma: e.formaCobranca,
    cancelada: Boolean(e.canceladaEm),
    hoje: hojeNoFuso(e.timezone),
    toleranciaDias: TOLERANCIA_DIAS,
    faturas: e.faturas.map((f) => ({ ...f, vencimento: f.vencimento.toISOString().slice(0, 10) })),
  });
}

/**
 * Cria cliente e assinatura por boleto no Asaas e traz a primeira fatura.
 *
 * Idempotente: se a assinatura já existe, só sincroniza. Nunca lança: a
 * contratação não pode falhar porque o Asaas está fora do ar. O erro fica em
 * `Empresa.erroCobranca` e a tela de assinatura oferece "Gerar boleto".
 */
export async function iniciarCobranca(empresaId: string): Promise<{ ok: boolean; erro?: string }> {
  const e = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
  if (e.formaCobranca !== "BOLETO_ASAAS") return { ok: true };
  if (e.asaasSubscriptionId) return sincronizarFaturas(empresaId);

  const valor = PLANOS[e.plano].precoMensalCentavos;
  if (valor == null) return registrarErro(empresaId, "Plano com preço por colaborador: a cobrança é emitida pelo financeiro.");
  if (!asaasConfigurado()) return registrarErro(empresaId, "Cobrança não configurada no servidor (ASAAS_API_KEY).");

  try {
    const clienteId =
      e.asaasCustomerId ??
      (await acharOuCriarCliente({ nome: e.razaoSocial, cnpj: e.cnpj, email: e.emailCobranca ?? "", empresaId }));
    await prisma.empresa.update({ where: { id: empresaId }, data: { asaasCustomerId: clienteId } });

    const assinaturaId = await criarAssinaturaBoleto({
      clienteId,
      valorCentavos: valor,
      primeiroVencimento: somarDias(hojeNoFuso(e.timezone), DIAS_PRIMEIRO_BOLETO),
      descricao: `Dilon Ponto — plano ${PLANOS[e.plano].nome}`,
      empresaId,
    });
    await prisma.empresa.update({ where: { id: empresaId }, data: { asaasSubscriptionId: assinaturaId, erroCobranca: null } });
    return sincronizarFaturas(empresaId);
  } catch (err) {
    console.error("[cobranca] falha ao iniciar", empresaId, err);
    return registrarErro(empresaId, err instanceof ErroAsaas ? err.motivo : "Não foi possível falar com o Asaas.");
  }
}

/** Traz do Asaas todas as cobranças da assinatura (o "Atualizar situação" da tela). */
export async function sincronizarFaturas(empresaId: string): Promise<{ ok: boolean; erro?: string }> {
  const e = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
  if (!e.asaasSubscriptionId) return iniciarCobranca(empresaId);
  try {
    for (const p of await pagamentosDaAssinatura(e.asaasSubscriptionId)) await gravarPagamento(empresaId, p);
    await prisma.empresa.update({ where: { id: empresaId }, data: { erroCobranca: null } });
    return { ok: true };
  } catch (err) {
    console.error("[cobranca] falha ao sincronizar", empresaId, err);
    return registrarErro(empresaId, err instanceof ErroAsaas ? err.motivo : "Não foi possível falar com o Asaas.");
  }
}

/** Grava (ou atualiza) a fatura a partir do pagamento do Asaas. Usado pelo webhook e pela sincronização. */
export async function gravarPagamento(empresaId: string, p: PagamentoAsaas, apagado = false) {
  const status: StatusFatura = statusDaFatura(p.status, apagado || Boolean(p.deleted));
  const existente = await prisma.fatura.findUnique({ where: { asaasPaymentId: p.id } });
  const precisaLinha = status !== "PAGA" && status !== "CANCELADA" && !existente?.linhaDigitavel;
  const dados = {
    valorCentavos: Math.round(Number(p.value) * 100),
    vencimento: new Date(`${p.dueDate}T00:00:00Z`),
    status,
    urlFatura: p.invoiceUrl ?? existente?.urlFatura ?? null,
    urlBoleto: p.bankSlipUrl ?? existente?.urlBoleto ?? null,
    linhaDigitavel: precisaLinha ? await linhaDigitavel(p.id) : (existente?.linhaDigitavel ?? null),
    pagaEm:
      status === "PAGA"
        ? (existente?.pagaEm ?? new Date(`${p.paymentDate ?? p.clientPaymentDate ?? p.dueDate}T12:00:00Z`))
        : null,
  };
  await prisma.fatura.upsert({
    where: { asaasPaymentId: p.id },
    create: { empresaId, asaasPaymentId: p.id, ...dados },
    update: dados,
  });
}

async function registrarErro(empresaId: string, erro: string) {
  await prisma.empresa.update({ where: { id: empresaId }, data: { erroCobranca: erro } });
  return { ok: false, erro };
}
