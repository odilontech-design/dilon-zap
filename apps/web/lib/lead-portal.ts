import { prisma } from "@dilon-zap/db";
import { ROTULO_ORIGEM, type LeadOlx } from "@dilon-zap/portais";
import { garantirFunilPadrao } from "@/lib/funis";
import { upsertContactByPhone } from "@/lib/contact-server";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";

/**
 * Lead que veio da OLX: vira contato e negociação no CRM (origem "OLX", com o
 * carro no título e o valor dele) e uma tarefa de chamar agora. Não responde
 * ao comprador sozinho: a OLX só avisa do chat (responder é no portal), e o
 * telefone que ela entrega serve para a equipe chamar no WhatsApp.
 *
 * A mesma entrega duas vezes não duplica: a chave do lead é única por loja.
 */

export type ResultadoLead = { duplicado: boolean; negociacaoId: string | null; semTelefone: boolean };

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
  const carro = pub?.veiculo ?? null;
  const origem = ROTULO_ORIGEM[lead.origem];

  let negociacaoId: string | null = null;
  if (lead.telefone) {
    const { contact } = await upsertContactByPhone(tenantId, lead.telefone, lead.nome);
    if (lead.email && !contact.email) await prisma.contact.update({ where: { id: contact.id }, data: { email: lead.email } });

    const funil = await garantirFunilPadrao(tenantId);
    const etapa =
      (await prisma.stage.findFirst({ where: { funilId: funil.id }, orderBy: { position: "asc" } })) ??
      (await prisma.stage.create({ data: { tenantId, funilId: funil.id, name: "Novos leads", position: 0 } }));

    const titulo = carro ? `${nomeDoVeiculo(carro)} (OLX)` : lead.linkAnuncio ? "Anúncio da OLX" : "Contato pela OLX";
    const celular = lead.telefone.length === 13 && lead.telefone[4] === "9";
    const primeiro = lead.nome.split(" ")[0];
    const resumo = [lead.mensagem && `"${lead.mensagem.slice(0, 140)}"`, lead.troca && `Troca: ${lead.troca}`].filter(Boolean).join(" · ");

    negociacaoId = await prisma.$transaction(async (tx) => {
      // O mesmo comprador perguntando de novo pelo mesmo carro: soma uma
      // tarefa na negociação aberta, em vez de abrir outra.
      const aberta = await tx.negociacao.findFirst({ where: { tenantId, contactId: contact.id, titulo, status: "ABERTA" }, select: { id: true } });
      const id =
        aberta?.id ??
        (
          await tx.negociacao.create({
            data: { tenantId, contactId: contact.id, funilId: funil.id, stageId: etapa.id, titulo, valorCents: carro?.precoCents ?? 0, origem: "OLX" },
            select: { id: true },
          })
        ).id;
      if (!aberta) await tx.historicoDeEtapa.create({ data: { negociacaoId: id, tipo: "CRIADA", paraStageId: etapa.id, paraEtapaNome: etapa.name, porNome: "OLX" } });
      await tx.tarefaNegociacao.create({
        data: {
          tenantId,
          negociacaoId: id,
          tipo: celular ? "WHATSAPP" : "LIGACAO",
          titulo: `${celular ? "Chamar" : "Ligar para"} ${primeiro} (${origem} da OLX)${resumo ? `: ${resumo}` : ""}`.slice(0, 300),
          venceEm: new Date(),
        },
      });
      return id;
    });
  }

  await prisma.leadPortal.create({
    data: {
      tenantId,
      portal: "OLX",
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
  });
  return { duplicado: false, negociacaoId, semTelefone: !lead.telefone };
}
