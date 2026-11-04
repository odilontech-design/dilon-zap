import { prisma } from "@dilon-zap/db";
import type { Prisma } from "@prisma/client";
import { createAsaasSubscriptionCheckout, getLatestCheckoutUrl, AsaasError } from "./asaas";
import { emailDeBoasVindas, emailDeConfirmacao, HORAS_DO_LINK, hashDoToken, limitesDoPlano, modulosDoPlano, novoToken, type PedidoDeContratacao, type PlanoDeAutoatendimento, condicoesDaContratacao } from "./erp-contratacao";
import { contratarNoErp, erpConfigurado, ErpIndisponivelError, previaDoTermo, redefinirSenha, versoesDeTermo, type ErpCondicoes, type ErpPreviaDoTermo } from "./erp-contabilidade";
import { emailConfigurado, enviarEmail } from "./erp-email";
import { slugUnico } from "./tenant-slug";

/** A contratação online só existe com e-mail (confirmação) e ERP (criação) configurados. */
export const contratacaoDisponivel = () => emailConfigurado() && erpConfigurado();

const baseDoSite = () => (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");

export async function previaParaContratacao(plano: PlanoDeAutoatendimento, escritorioNome: string, agora = new Date()): Promise<{ previa: ErpPreviaDoTermo; condicoes: ErpCondicoes }> {
  const condicoes = condicoesDaContratacao(plano, agora);
  const previa = await previaDoTermo({ versao: await versaoAtual(), escritorioNome, ...limitesDoPlano(plano), condicoes });
  return { previa, condicoes };
}

const versaoAtual = async () => (await versoesDeTermo()).atual;

export type ResultadoIniciar = { ok: true } | { ok: false; status: number; erro: string };

/**
 * Registra o pedido (com a prova do aceite) e manda o link de confirmação. Nada é criado ainda:
 * quem controla o e-mail é quem confirma.
 */
export async function iniciarContratacao(p: PedidoDeContratacao, ctx: { ip: string | null; userAgent: string | null }, agora = new Date()): Promise<ResultadoIniciar> {
  const cnpj = p.cnpj.replace(/\D/g, "");
  const jaContratou = await prisma.contratacaoErp.findFirst({ where: { cnpj, status: { in: ["CONCLUIDA", "CRIANDO"] } }, select: { id: true } });
  if (jaContratou) return { ok: false, status: 409, erro: "Já existe uma contratação para este CNPJ. Se foi você, use o e-mail de boas-vindas; senão, fale com a Dilon Tech." };

  // O texto que a pessoa aceitou tem de ser o de agora; se o termo mudou desde que ela o leu, ela precisa ler de novo.
  let previa: ErpPreviaDoTermo, condicoes: ErpCondicoes;
  try {
    ({ previa, condicoes } = await previaParaContratacao(p.plano, p.escritorioNome, agora));
  } catch (e) {
    return { ok: false, status: 503, erro: e instanceof ErpIndisponivelError ? "Não conseguimos montar o termo agora. Tente em instantes." : "Falha inesperada. Tente em instantes." };
  }
  if (previa.hash !== p.termoHash) return { ok: false, status: 409, erro: "O termo foi atualizado. Revise-o e aceite de novo." };

  const token = novoToken();
  const dados = {
    status: "AGUARDANDO_EMAIL" as const,
    plano: p.plano,
    escritorioNome: p.escritorioNome,
    cnpj,
    responsavelNome: p.responsavelNome,
    responsavelCpf: p.responsavelCpf.replace(/\D/g, ""),
    email: p.email,
    telefone: p.telefone,
    codigoDesejado: p.codigoDesejado || null,
    condicoes: condicoes as unknown as Prisma.InputJsonValue,
    tokenHash: hashDoToken(token),
    expiraEm: new Date(agora.getTime() + HORAS_DO_LINK * 3_600_000),
    termoVersao: previa.versao,
    termoHash: previa.hash,
    aceitoEm: agora,
    aceiteIp: ctx.ip,
    aceiteUserAgent: ctx.userAgent,
    erro: null,
  };
  // Quem pede de novo antes de confirmar não gera uma segunda linha: o pedido anterior é substituído (e o link antigo morre).
  const anterior = await prisma.contratacaoErp.findFirst({ where: { email: p.email, status: "AGUARDANDO_EMAIL" }, select: { id: true } });
  const linha = anterior ? await prisma.contratacaoErp.update({ where: { id: anterior.id }, data: dados }) : await prisma.contratacaoErp.create({ data: dados });

  const msg = emailDeConfirmacao({ nome: p.responsavelNome, escritorio: p.escritorioNome, link: `${baseDoSite()}/contratar/contabilidade/confirmar?t=${token}` });
  try {
    await enviarEmail(p.email, msg.assunto, msg.texto);
  } catch (e) {
    console.error("[contratar-erp] falha ao enviar o e-mail de confirmação", e);
    await prisma.contratacaoErp.delete({ where: { id: linha.id } }).catch(() => undefined);
    return { ok: false, status: 502, erro: "Não conseguimos enviar o e-mail de confirmação. Confira o endereço e tente de novo." };
  }
  return { ok: true };
}

export type ResultadoConfirmar =
  | { ok: true; jaCriado: false; loginUrl: string; email: string; senha: string; fimDoTeste: string; primeiraCobranca: string; valorMensalCents: number; linkDePagamento: string | null; avisoCobranca: string | null }
  | { ok: true; jaCriado: true }
  | { ok: false; status: number; erro: string };

/** Cria a empresa no Zap, o escritório no ERP (com o aceite), a cobrança e manda as boas-vindas. Pode ser repetida: cada etapa é idempotente. */
export async function confirmarContratacao(token: string, agora = new Date()): Promise<ResultadoConfirmar> {
  const linha = await prisma.contratacaoErp.findUnique({ where: { tokenHash: hashDoToken(token) } });
  if (!linha) return { ok: false, status: 404, erro: "Este link não é válido." };
  if (linha.status === "CONCLUIDA") return { ok: true, jaCriado: true };
  if (linha.status === "AGUARDANDO_EMAIL" && linha.expiraEm.getTime() < agora.getTime()) return { ok: false, status: 410, erro: "Este link expirou. Faça o pedido de novo." };

  // Só uma requisição por vez assume a criação (duplo clique, link aberto em duas abas).
  const assumiu = await prisma.contratacaoErp.updateMany({ where: { id: linha.id, status: { in: ["AGUARDANDO_EMAIL", "ERRO"] } }, data: { status: "CRIANDO", erro: null } });
  if (assumiu.count === 0) return { ok: false, status: 409, erro: "A criação do seu escritório já está em andamento. Aguarde um instante e atualize a página." };

  const condicoes = linha.condicoes as unknown as ErpCondicoes;
  const plano = linha.plano as PlanoDeAutoatendimento;
  try {
    // 1) empresa + assinatura em teste (a cobrança é uma só, como no resto do Zap)
    let tenantId = linha.tenantId;
    if (!tenantId) {
      const slug = await slugUnico(linha.escritorioNome);
      const t = await prisma.tenant.create({
        data: {
          name: linha.escritorioNome,
          slug,
          subscription: {
            create: {
              status: "TRIAL",
              plano: "ESSENCIAL",
              plataformaCompleta: false,
              amountCents: condicoes.valorMensalCents,
              cycleDay: condicoes.diaVencimento,
              testeAte: new Date(`${condicoes.fimDoTeste}T23:59:59-03:00`),
              billingEmail: linha.email,
              billingDocument: linha.cnpj,
            },
          },
        },
      });
      tenantId = t.id;
      await prisma.contratacaoErp.update({ where: { id: linha.id }, data: { tenantId } });
    }

    // 2) escritório + sócio + aceite no ERP
    const pedidoErp = {
      zapTenantId: tenantId,
      escritorioNome: linha.escritorioNome,
      ...limitesDoPlano(plano),
      modulos: modulosDoPlano(plano),
      admin: { nome: linha.responsavelNome, cpf: linha.responsavelCpf, email: linha.email },
      termo: { versao: linha.termoVersao, hash: linha.termoHash, condicoes },
      aceite: { em: linha.aceitoEm.toISOString(), ip: linha.aceiteIp, userAgent: linha.aceiteUserAgent },
    };
    let r;
    try {
      r = await contratarNoErp({ ...pedidoErp, slug: linha.codigoDesejado || undefined });
    } catch (e) {
      // Código desejado já em uso: segue com o que o ERP gerar a partir do nome.
      if (linha.codigoDesejado && e instanceof ErpIndisponivelError && e.status === 409) r = await contratarNoErp(pedidoErp);
      else throw e;
    }
    // Já existia (tentativa anterior criou o escritório mas não terminou): a senha antiga não se recupera, gera-se outra.
    const senha = r.admin?.senhaProvisoria ?? (await redefinirSenha(tenantId, linha.email)).senhaProvisoria;
    const e = r.escritorio;

    await prisma.tenantErpContabilidade.upsert({
      where: { tenantId },
      create: { tenantId, escritorioId: e.id, escritorioSlug: e.slug, loginUrl: e.urlLogin, plano: linha.plano, mensalCents: condicoes.valorMensalCents, limiteEmpresas: e.limiteEmpresas, limiteUsuarios: e.limiteUsuarios },
      update: {},
    });

    // 3) primeira cobrança (Asaas): o cliente cadastra o cartão no link; a cobrança só acontece na data combinada
    let linkDePagamento: string | null = null;
    let avisoCobranca: string | null = null;
    if (process.env.ASAAS_API_KEY) {
      try {
        const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId } });
        if (sub.asaasSubscriptionId) {
          linkDePagamento = await getLatestCheckoutUrl(sub.asaasSubscriptionId);
        } else {
          const c = await createAsaasSubscriptionCheckout({ tenantName: linha.escritorioNome, amountCents: condicoes.valorMensalCents, cycleDay: condicoes.diaVencimento, payerEmail: linha.email, payerDocument: linha.cnpj });
          await prisma.subscription.update({ where: { id: sub.id }, data: { asaasCustomerId: c.customerId, asaasSubscriptionId: c.id, asaasSubscriptionStatus: c.status } });
          linkDePagamento = c.checkoutUrl;
        }
      } catch (err) {
        avisoCobranca = err instanceof AsaasError ? err.motivo : "falha ao gerar a cobrança automática";
        console.error("[contratar-erp] cobrança não gerada", err);
      }
    } else {
      avisoCobranca = "cobrança automática não configurada (ASAAS_API_KEY)";
    }

    await prisma.contratacaoErp.update({ where: { id: linha.id }, data: { status: "CONCLUIDA", concluidaEm: new Date(), erro: avisoCobranca ? `Cobrança pendente: ${avisoCobranca}` : null } });

    // 4) boas-vindas (a senha também aparece na tela de confirmação; se o e-mail falhar, a pessoa não fica sem ela)
    const bv = emailDeBoasVindas({
      nome: linha.responsavelNome, escritorio: linha.escritorioNome, loginUrl: e.urlLogin, email: linha.email, senha,
      fimDoTeste: condicoes.fimDoTeste, primeiraCobranca: condicoes.primeiraCobranca, valorMensalCents: condicoes.valorMensalCents, linkDePagamento,
    });
    await enviarEmail(linha.email, bv.assunto, bv.texto).catch((err) => console.error("[contratar-erp] falha nas boas-vindas", err));

    return { ok: true, jaCriado: false, loginUrl: e.urlLogin, email: linha.email, senha, fimDoTeste: condicoes.fimDoTeste, primeiraCobranca: condicoes.primeiraCobranca, valorMensalCents: condicoes.valorMensalCents, linkDePagamento, avisoCobranca };
  } catch (err) {
    const motivo = err instanceof ErpIndisponivelError ? err.message : "falha inesperada";
    console.error("[contratar-erp] erro ao criar", err);
    await prisma.contratacaoErp.update({ where: { id: linha.id }, data: { status: "ERRO", erro: motivo.slice(0, 300) } }).catch(() => undefined);
    return { ok: false, status: 502, erro: "Não conseguimos concluir agora. Seus dados estão salvos: abra o link do e-mail de novo em alguns minutos." };
  }
}
