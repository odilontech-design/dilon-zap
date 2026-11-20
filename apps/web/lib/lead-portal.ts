import { prisma } from "@dilon-zap/db";
import type { Portal } from "@dilon-zap/db";
import { ROTULO_ORIGEM, type LeadOlx } from "@dilon-zap/portais";
import { garantirFunilPadrao } from "@/lib/funis";
import { upsertContactByPhone } from "@/lib/contact-server";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";

/**
 * Lead que veio de um portal (OLX por webhook; Na Pista, MobiAuto e Webmotors
 * por e-mail): vira contato e negociação no CRM (origem = o portal, com o carro
 * no título e o valor dele) e uma tarefa de chamar agora. Não responde ao
 * comprador sozinho: o telefone serve para a equipe chamar no WhatsApp.
 * Com "distribuir leads" ligado, a negociação já nasce com um vendedor.
 *
 * A mesma entrega duas vezes não duplica: a chave do lead é única por loja.
 */

export const NOME_DO_PORTAL: Record<Portal, string> = { OLX: "OLX", WEBMOTORS: "Webmotors", MOBIAUTO: "MobiAuto", NAPISTA: "Na Pista", INSTAGRAM: "Instagram", MERCADO_LIVRE: "Mercado Livre" };

type CarroDoLead = { id: string; marca: string; modelo: string; versao: string | null; anoFabricacao: number; anoModelo: number; precoCents: number };

export type EntradaLead = {
  portal: Portal;
  chave: string;
  /** "WhatsApp", "telefone", "chat da OLX"... ou o próprio portal. */
  contato: string;
  origem: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  mensagem: string;
  idNoPortal: string | null;
  linkAnuncio: string | null;
  criadoEm: Date;
  troca?: string | null;
  carro: CarroDoLead | null;
};

/** O vendedor ativo com menos negociações abertas (repartição justa). Sem vendedor, ninguém. */
export async function proximoVendedor(tenantId: string): Promise<string | null> {
  const config = await prisma.veiculosConfig.findUnique({ where: { tenantId }, select: { distribuirLeads: true } });
  if (!config?.distribuirLeads) return null;
  const vendedores = await prisma.user.findMany({ where: { tenantId, role: "AGENT", deactivatedAt: null }, select: { id: true } });
  if (!vendedores.length) return null;
  const abertas = await prisma.negociacao.groupBy({ by: ["responsavelId"], where: { tenantId, status: "ABERTA", responsavelId: { in: vendedores.map((v) => v.id) } }, _count: true });
  const conta = new Map(abertas.map((a) => [a.responsavelId, a._count]));
  return vendedores.map((v) => ({ id: v.id, n: conta.get(v.id) ?? 0 })).sort((a, b) => a.n - b.n || a.id.localeCompare(b.id))[0].id;
}

export type ResultadoLead = { duplicado: boolean; negociacaoId: string | null; semTelefone: boolean; leadId?: string };

/** O lead da OLX (webhook): acha o carro pelo número do anúncio e registra. */
export async function registrarLeadDoPortal(tenantId: string, lead: LeadOlx): Promise<ResultadoLead> {
  const ja = await prisma.leadPortal.findUnique({ where: { tenantId_portal_chave: { tenantId, portal: "OLX", chave: lead.chave } }, select: { negociacaoId: true, semTelefone: true } });
  if (ja) return { duplicado: true, negociacaoId: ja.negociacaoId, semTelefone: ja.semTelefone };

  // O carro: pelo número do anúncio na OLX (listId), ou pelo id que o Zap mandou (adId).
  const pub = await prisma.publicacaoPortal.findFirst({
    where: {
      tenantId,
      portal: "OLX",
      OR: [...(lead.idNoPortal ? [{ idExterno: lead.idNoPortal }] : []), ...(lead.idEnviado ? [{ idEnviado: lead.idEnviado }] : [])],
    },
    select: { veiculo: { select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, precoCents: true } } },
  });
  return registrarEntradaLead(tenantId, {
    portal: "OLX",
    chave: lead.chave,
    contato: ROTULO_ORIGEM[lead.origem],
    origem: lead.origem,
    nome: lead.nome,
    email: lead.email,
    telefone: lead.telefone,
    mensagem: lead.mensagem,
    idNoPortal: lead.idNoPortal,
    linkAnuncio: lead.linkAnuncio,
    criadoEm: lead.criadoEm,
    troca: lead.troca,
    carro: pub?.veiculo ?? null,
  });
}

/** Grava o lead de qualquer portal: contato + negociação + tarefa de chamar (se há telefone) + registro do lead. */
export async function registrarEntradaLead(tenantId: string, lead: EntradaLead): Promise<ResultadoLead> {
  const ja = await prisma.leadPortal.findUnique({ where: { tenantId_portal_chave: { tenantId, portal: lead.portal, chave: lead.chave } }, select: { negociacaoId: true, semTelefone: true } });
  if (ja) return { duplicado: true, negociacaoId: ja.negociacaoId, semTelefone: ja.semTelefone };
  const carro = lead.carro;
  const nomePortal = NOME_DO_PORTAL[lead.portal];
  const de = nomePortal === "OLX" ? "da" : "do";

  let negociacaoId: string | null = null;
  if (lead.telefone) {
    const { contact } = await upsertContactByPhone(tenantId, lead.telefone, lead.nome);
    if (lead.email && !contact.email) await prisma.contact.update({ where: { id: contact.id }, data: { email: lead.email } });

    const funil = await garantirFunilPadrao(tenantId);
    const etapa =
      (await prisma.stage.findFirst({ where: { funilId: funil.id }, orderBy: { position: "asc" } })) ??
      (await prisma.stage.create({ data: { tenantId, funilId: funil.id, name: "Novos leads", position: 0 } }));

    const titulo = carro ? `${nomeDoVeiculo(carro)} (${nomePortal})` : lead.linkAnuncio ? `Anúncio ${de} ${nomePortal}` : `Contato pel${de === "da" ? "a" : "o"} ${nomePortal}`;
    const celular = lead.telefone.length === 13 && lead.telefone[4] === "9";
    const primeiro = lead.nome.split(" ")[0];
    const resumo = [lead.mensagem && `"${lead.mensagem.slice(0, 140)}"`, lead.troca && `Troca: ${lead.troca}`].filter(Boolean).join(" · ");
    const responsavelId = await proximoVendedor(tenantId);

    negociacaoId = await prisma.$transaction(async (tx) => {
      // O mesmo comprador perguntando de novo pelo mesmo carro: soma uma
      // tarefa na negociação aberta, em vez de abrir outra.
      const aberta = await tx.negociacao.findFirst({ where: { tenantId, contactId: contact.id, titulo, status: "ABERTA" }, select: { id: true } });
      const id =
        aberta?.id ??
        (
          await tx.negociacao.create({
            data: { tenantId, contactId: contact.id, funilId: funil.id, stageId: etapa.id, titulo, valorCents: carro?.precoCents ?? 0, origem: nomePortal, ...(responsavelId ? { responsavelId } : {}) },
            select: { id: true },
          })
        ).id;
      if (!aberta) await tx.historicoDeEtapa.create({ data: { negociacaoId: id, tipo: "CRIADA", paraStageId: etapa.id, paraEtapaNome: etapa.name, porNome: nomePortal } });
      await tx.tarefaNegociacao.create({
        data: {
          tenantId,
          negociacaoId: id,
          tipo: celular ? "WHATSAPP" : "LIGACAO",
          titulo: `${celular ? "Chamar" : "Ligar para"} ${primeiro} (${lead.contato} ${de} ${nomePortal})${resumo ? `: ${resumo}` : ""}`.slice(0, 300),
          venceEm: new Date(),
        },
      });
      return id;
    });
  }

  const criado = await prisma.leadPortal.create({
    data: {
      tenantId,
      portal: lead.portal,
      chave: lead.chave,
      origem: lead.origem,
      nome: lead.nome,
      email: lead.email,
      telefone: lead.telefone,
      mensagem: lead.mensagem,
      idNoPortal: lead.idNoPortal,
      linkAnuncio: lead.linkAnuncio,
      veiculoId: carro?.id ?? null,
      negociacaoId,
      semTelefone: !lead.telefone,
      recebidoEm: lead.criadoEm,
    },
    select: { id: true },
  });
  return { duplicado: false, negociacaoId, semTelefone: !lead.telefone, leadId: criado.id };
}
