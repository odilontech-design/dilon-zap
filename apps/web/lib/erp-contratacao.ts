import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { cnpjValido, cpfValido, somenteDigitos } from "./documento";
import { ERP_PLANOS, MODULOS_DO_PLANO, PLANOS_DE_AUTOATENDIMENTO, type PlanoDeAutoatendimento } from "./erp-regras";
import { DIAS_DE_TESTE } from "./saas";

/**
 * Regras da contratação online do ERP (puras, sem banco nem rede): o que se oferece, a que preço,
 * quando o teste acaba e a primeira cobrança vence, e a validação do formulário.
 */

export { PLANOS_DE_AUTOATENDIMENTO, type PlanoDeAutoatendimento };

export const GARANTIA_DE_PRECO_MESES = 12;
/** Validade do link de confirmação enviado por e-mail. */
export const HORAS_DO_LINK = 24;

const DIA_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Data de hoje em São Paulo (UTC-3, sem horário de verão), meia-noite UTC. */
export const hojeEmSP = (agora: Date) => new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()) - (agora.getUTCHours() < 3 ? DIA_MS : 0));

/**
 * Datas do ciclo de um escritório que contrata hoje: o teste dura DIAS_DE_TESTE dias e a primeira
 * cobrança vence no primeiro dia a partir daí cujo dia do mês é de 1 a 28 (é o intervalo que a
 * assinatura aceita). O teste termina na véspera.
 */
export function ciclo(agora: Date) {
  let primeira = new Date(hojeEmSP(agora).getTime() + (DIAS_DE_TESTE + 1) * DIA_MS);
  while (primeira.getUTCDate() > 28) primeira = new Date(primeira.getTime() + DIA_MS);
  return { primeiraCobranca: iso(primeira), fimDoTeste: iso(new Date(primeira.getTime() - DIA_MS)), diaVencimento: primeira.getUTCDate() };
}

/** Condições que entram no termo (e na assinatura) de quem contrata hoje. */
export function condicoesDaContratacao(plano: PlanoDeAutoatendimento, agora: Date) {
  const p = ERP_PLANOS[plano];
  return { plano: p.nome, valorMensalCents: p.sugestaoMensalCents, valorTabelaCents: p.sugestaoMensalCents, garantiaMeses: GARANTIA_DE_PRECO_MESES, ...ciclo(agora) };
}

export const limitesDoPlano = (plano: PlanoDeAutoatendimento) => ({ limiteEmpresas: ERP_PLANOS[plano].limiteEmpresas, limiteUsuarios: ERP_PLANOS[plano].limiteUsuarios });
export const modulosDoPlano = (plano: PlanoDeAutoatendimento) => [...MODULOS_DO_PLANO[plano]];

// ── Link de confirmação ──────────────────────────────────────────────────────

export const novoToken = () => randomBytes(32).toString("base64url");
export const hashDoToken = (t: string) => createHash("sha256").update(t).digest("hex");

// ── Formulário ───────────────────────────────────────────────────────────────

const nomeCompleto = z.string().trim().min(5, "Informe o nome completo.").max(120).refine((n) => n.includes(" "), "Informe o nome completo.");

/** Dados do escritório que determinam o texto do termo (a prévia só precisa destes). */
export const esquemaDaPrevia = z.object({
  plano: z.enum(PLANOS_DE_AUTOATENDIMENTO),
  escritorioNome: z.string().trim().min(2, "Informe o nome do escritório.").max(120),
});

export const esquemaDoPedido = esquemaDaPrevia.extend({
  cnpj: z.string().trim().refine((v) => cnpjValido(v), "CNPJ inválido."),
  responsavelNome: nomeCompleto,
  responsavelCpf: z.string().trim().refine((v) => cpfValido(v), "CPF inválido."),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(160),
  telefone: z.string().trim().refine((v) => { const n = somenteDigitos(v).length; return n >= 10 && n <= 13; }, "Confira o WhatsApp."),
  codigoDesejado: z.string().trim().toLowerCase().max(40).optional().or(z.literal("")),
  termoHash: z.string().regex(/^[0-9a-f]{64}$/),
  aceitei: z.literal(true, { errorMap: () => ({ message: "É preciso ler e aceitar o termo." }) }),
  /** Campo-armadilha, escondido: humano nunca preenche. */
  website: z.string().optional(),
});
export type PedidoDeContratacao = z.infer<typeof esquemaDoPedido>;

// ── Mensagens ────────────────────────────────────────────────────────────────

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const dataBR = (isoDia: string) => isoDia.split("-").reverse().join("/");

export function emailDeConfirmacao(d: { nome: string; escritorio: string; link: string }) {
  return {
    assunto: "Confirme seu e-mail para criar o escritório no Dilon Contabilidade",
    texto: [
      `Olá, ${primeiroNome(d.nome)}!`,
      "",
      `Recebemos o pedido de contratação do Dilon Contabilidade para ${d.escritorio}.`,
      `Para criar o escritório, confirme o seu e-mail neste link (vale por ${HORAS_DO_LINK} horas):`,
      d.link,
      "",
      "Se não foi você, ignore esta mensagem: nada é criado sem a confirmação.",
      "",
      "Dilon Tech",
    ].join("\n"),
  };
}

export function emailDeBoasVindas(d: { nome: string; escritorio: string; loginUrl: string; email: string; senha: string; fimDoTeste: string; primeiraCobranca: string; valorMensalCents: number; linkDePagamento: string | null }) {
  const valor = (d.valorMensalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return {
    assunto: `Seu escritório ${d.escritorio} está pronto no Dilon Contabilidade`,
    texto: [
      `Olá, ${primeiroNome(d.nome)}! Seu escritório já está criado.`,
      "",
      "Acesse:",
      `Endereço: ${d.loginUrl}`,
      `E-mail: ${d.email}`,
      `Senha provisória: ${d.senha}`,
      "No primeiro acesso o sistema pede para você criar a sua senha.",
      "",
      `Teste sem cobrança até ${dataBR(d.fimDoTeste)}. A primeira cobrança (${valor}/mês) vence em ${dataBR(d.primeiraCobranca)}.`,
      d.linkDePagamento ? `Para deixar o pagamento cadastrado: ${d.linkDePagamento}` : "Você receberá o link de pagamento antes da primeira cobrança.",
      "",
      "Dúvidas? É só responder este e-mail.",
      "Dilon Tech",
    ].join("\n"),
  };
}
