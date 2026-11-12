import { prisma } from "@dilon-zap/db";
import { garantirFunilPadrao } from "@/lib/funis";
import { upsertContactByPhone } from "@/lib/contact-server";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import type { LojaPublica } from "@/lib/vitrine";

/**
 * O visitante da vitrine que prefere ser chamado: vira contato e negociação
 * no CRM (origem "Site", com o carro no título e o valor dele), com a tarefa
 * de chamar no WhatsApp para agora. Não manda mensagem ao cliente sozinho: quem
 * chama é a equipe (ou o Vendedor IA, quando ele ganhar essa função).
 */

/** Freio simples contra robô e clique repetido: 5 envios por hora por IP e por telefone. */
const envios = new Map<string, number[]>();
export function podeEnviar(chaves: string[], agora = Date.now()): boolean {
  const janela = 60 * 60_000;
  for (const k of chaves) {
    const recentes = (envios.get(k) ?? []).filter((t) => agora - t < janela);
    if (recentes.length >= 5) return false;
    envios.set(k, recentes);
  }
  for (const k of chaves) envios.get(k)!.push(agora);
  return true;
}

export async function registrarLeadDoSite(input: {
  loja: LojaPublica;
  nome: string;
  telefone: string; // só dígitos, com DDI
  mensagem: string | null;
  veiculoId: string | null;
}): Promise<{ negociacaoId: string | null }> {
  const { loja } = input;
  const carro = input.veiculoId
    ? await prisma.veiculo.findFirst({ where: { id: input.veiculoId, tenantId: loja.tenantId }, select: { marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, precoCents: true } })
    : null;
  const { contact } = await upsertContactByPhone(loja.tenantId, input.telefone, input.nome);

  const funil = await garantirFunilPadrao(loja.tenantId);
  // Funil ainda sem etapas (loja que nunca usou o CRM): cria a primeira, em
  // vez de deixar o lead do site virar só um contato que ninguém vê.
  const etapa =
    (await prisma.stage.findFirst({ where: { funilId: funil.id }, orderBy: { position: "asc" } })) ??
    (await prisma.stage.create({ data: { tenantId: loja.tenantId, funilId: funil.id, name: "Novos leads", position: 0 } }));

  const titulo = carro ? `${nomeDoVeiculo(carro)} (site)` : "Contato pelo site";
  const n = await prisma.$transaction(async (tx) => {
    const neg = await tx.negociacao.create({
      data: {
        tenantId: loja.tenantId,
        contactId: contact.id,
        funilId: funil.id,
        stageId: etapa.id,
        titulo,
        valorCents: carro?.precoCents ?? 0,
        origem: "Site",
      },
      select: { id: true },
    });
    await tx.historicoDeEtapa.create({ data: { negociacaoId: neg.id, tipo: "CRIADA", paraStageId: etapa.id, paraEtapaNome: etapa.name, porNome: "Site da loja" } });
    await tx.tarefaNegociacao.create({
      data: {
        tenantId: loja.tenantId,
        negociacaoId: neg.id,
        tipo: "WHATSAPP",
        titulo: `Chamar ${input.nome.split(" ")[0]} no WhatsApp${input.mensagem ? `: "${input.mensagem.slice(0, 120)}"` : ""}`,
        venceEm: new Date(),
      },
    });
    return neg;
  });
  return { negociacaoId: n.id };
}
