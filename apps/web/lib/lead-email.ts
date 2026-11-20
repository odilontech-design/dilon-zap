import { randomBytes } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { entenderEmail, lerEmail, normalizar, type LeadDeEmail } from "@dilon-zap/portais";
import { registrarEntradaLead, type ResultadoLead } from "@/lib/lead-portal";

/**
 * Central de leads por e-mail. Cada loja tem um endereço de entrada (um token
 * na URL do webhook do provedor de e-mail recebido); a loja configura no Gmail
 * o encaminhamento dos e-mails de lead dos portais para ele. Todo e-mail que
 * chega fica guardado (inclusive os que não entendemos), e os entendidos viram
 * contato + negociação + tarefa de chamar, como os leads da OLX.
 */

const MAX_TEXTO = 20_000;

export type ResultadoEmail = { situacao: "PROCESSADO" | "DUPLICADO" | "NAO_ENTENDIDO"; motivo?: string; leadId?: string; negociacaoId?: string | null };

export async function tenantDoToken(token: string): Promise<string | null> {
  const c = await prisma.veiculosConfig.findUnique({ where: { leadEmailToken: token }, select: { tenantId: true } });
  return c?.tenantId ?? null;
}

/** Gera (ou troca) o token do endereço de leads da loja. Trocar invalida o encaminhamento antigo. */
export async function novoTokenDeEmail(tenantId: string): Promise<string> {
  const token = randomBytes(18).toString("base64url");
  await prisma.veiculosConfig.upsert({ where: { tenantId }, create: { tenantId, leadEmailToken: token }, update: { leadEmailToken: token } });
  return token;
}

/** O carro do estoque que o e-mail cita: pela placa, ou pelo modelo + ano quando só um carro bate. */
export async function acharCarroDoLead(tenantId: string, lead: Pick<LeadDeEmail, "placa" | "veiculoTexto">) {
  const select = { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, precoCents: true } as const;
  if (lead.placa) {
    const porPlaca = await prisma.veiculo.findFirst({ where: { tenantId, placa: lead.placa }, select });
    if (porPlaca) return porPlaca;
  }
  if (!lead.veiculoTexto) return null;
  const texto = ` ${normalizar(lead.veiculoTexto)} `;
  const carros = await prisma.veiculo.findMany({ where: { tenantId, status: { in: ["DISPONIVEL", "RESERVADO"] } }, select });
  const bate = carros.filter((c) => {
    const modelo = normalizar(c.modelo);
    const ano = String(c.anoModelo);
    return modelo.length > 1 && texto.includes(` ${modelo} `) && (texto.includes(ano) || texto.includes(String(c.anoFabricacao)));
  });
  return bate.length === 1 ? bate[0] : null;
}

export async function registrarEmailDeLead(tenantId: string, raw: string | Buffer): Promise<ResultadoEmail> {
  const e = await lerEmail(raw);
  const base = { tenantId, messageId: e.messageId.slice(0, 200), de: e.de.slice(0, 200), assunto: e.assunto.slice(0, 300), texto: e.texto.slice(0, MAX_TEXTO), recebidoEm: e.recebidoEm };

  const ja = await prisma.emailDeLead.findUnique({ where: { tenantId_messageId: { tenantId, messageId: base.messageId } }, select: { id: true, situacao: true } });
  if (ja && ja.situacao !== "ERRO") return { situacao: "DUPLICADO" };
  if (ja) await prisma.emailDeLead.delete({ where: { id: ja.id } }); // falhou antes: tenta de novo

  const lido = entenderEmail(e);
  if (!lido.ok) {
    await prisma.emailDeLead.create({ data: { ...base, situacao: "NAO_ENTENDIDO", motivo: lido.motivo } });
    return { situacao: "NAO_ENTENDIDO", motivo: lido.motivo };
  }
  const l = lido.lead;
  let r: ResultadoLead;
  try {
    r = await registrarEntradaLead(tenantId, {
      portal: l.portal,
      chave: l.chave,
      contato: "e-mail",
      origem: "email",
      nome: l.nome,
      email: l.email,
      telefone: l.telefone,
      mensagem: l.mensagem,
      idNoPortal: null,
      linkAnuncio: l.linkAnuncio,
      criadoEm: l.criadoEm,
      carro: await acharCarroDoLead(tenantId, l),
    });
  } catch (err) {
    // Não perde o e-mail: fica guardado e o provedor tenta de novo (situação ERRO não conta como duplicado).
    const motivo = `falha ao registrar: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
    await prisma.emailDeLead.create({ data: { ...base, portal: l.portal, situacao: "ERRO", motivo } });
    throw err;
  }
  await prisma.emailDeLead.create({ data: { ...base, portal: l.portal, situacao: r.duplicado ? "DUPLICADO" : "PROCESSADO", leadId: r.leadId ?? null } });
  return { situacao: r.duplicado ? "DUPLICADO" : "PROCESSADO", leadId: r.leadId, negociacaoId: r.negociacaoId };
}
