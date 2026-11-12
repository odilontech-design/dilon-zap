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

/**
 * Formulários das páginas da vitrine ("Venda seu carro" e "Financiamento").
 * Mesmo caminho do "Quero ser chamado": contato + negociação no funil + tarefa
 * de chamar no WhatsApp. A diferença: quem manda o formulário de novo (o
 * mesmo contato, o mesmo assunto) soma uma tarefa na negociação que já está
 * aberta, em vez de abrir outra.
 */
async function negociacaoDaPagina(input: {
  loja: LojaPublica;
  nome: string;
  telefone: string;
  titulo: string;
  valorCents: number;
  origem: string;
  tarefa: string;
}): Promise<{ negociacaoId: string }> {
  const { loja } = input;
  const { contact } = await upsertContactByPhone(loja.tenantId, input.telefone, input.nome);
  const funil = await garantirFunilPadrao(loja.tenantId);
  const etapa =
    (await prisma.stage.findFirst({ where: { funilId: funil.id }, orderBy: { position: "asc" } })) ??
    (await prisma.stage.create({ data: { tenantId: loja.tenantId, funilId: funil.id, name: "Novos leads", position: 0 } }));

  const id = await prisma.$transaction(async (tx) => {
    const aberta = await tx.negociacao.findFirst({ where: { tenantId: loja.tenantId, contactId: contact.id, titulo: input.titulo, status: "ABERTA" }, select: { id: true } });
    const neg =
      aberta ??
      (await tx.negociacao.create({
        data: { tenantId: loja.tenantId, contactId: contact.id, funilId: funil.id, stageId: etapa.id, titulo: input.titulo, valorCents: input.valorCents, origem: input.origem },
        select: { id: true },
      }));
    if (!aberta) await tx.historicoDeEtapa.create({ data: { negociacaoId: neg.id, tipo: "CRIADA", paraStageId: etapa.id, paraEtapaNome: etapa.name, porNome: "Site da loja" } });
    await tx.tarefaNegociacao.create({ data: { tenantId: loja.tenantId, negociacaoId: neg.id, tipo: "WHATSAPP", titulo: input.tarefa.slice(0, 300), venceEm: new Date() } });
    return neg.id;
  });
  return { negociacaoId: id };
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

/** "Venda seu carro": o visitante quer que a loja avalie o carro dele. */
export async function registrarAvaliacaoDoSite(input: {
  loja: LojaPublica;
  nome: string;
  telefone: string;
  marca: string;
  modelo: string;
  ano: number | null;
  km: number | null;
  mensagem: string | null;
}) {
  const carro = `${input.marca} ${input.modelo}${input.ano ? ` ${input.ano}` : ""}`.trim();
  const detalhes = [input.km != null ? `${input.km.toLocaleString("pt-BR")} km` : null, input.mensagem ? `"${input.mensagem.slice(0, 120)}"` : null].filter(Boolean).join(" · ");
  return negociacaoDaPagina({
    loja: input.loja,
    nome: input.nome,
    telefone: input.telefone,
    titulo: `Avaliação: ${carro} (site)`,
    valorCents: 0,
    origem: "Site · Venda seu carro",
    tarefa: `Avaliar o ${carro} de ${primeiroNome(input.nome)} e chamar no WhatsApp${detalhes ? `: ${detalhes}` : ""}`,
  });
}

/** "Financiamento": o visitante quer simular, de um carro da vitrine ou em geral. */
export async function registrarFinanciamentoDoSite(input: {
  loja: LojaPublica;
  nome: string;
  telefone: string;
  veiculoId: string | null;
  entradaCents: number | null;
  mensagem: string | null;
}) {
  const carro = input.veiculoId
    ? await prisma.veiculo.findFirst({ where: { id: input.veiculoId, tenantId: input.loja.tenantId }, select: { marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, precoCents: true } })
    : null;
  const nomeCarro = carro ? nomeDoVeiculo(carro) : null;
  const detalhes = [input.entradaCents ? `entrada ${(input.entradaCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}` : null, input.mensagem ? `"${input.mensagem.slice(0, 120)}"` : null]
    .filter(Boolean)
    .join(" · ");
  return negociacaoDaPagina({
    loja: input.loja,
    nome: input.nome,
    telefone: input.telefone,
    titulo: nomeCarro ? `Financiamento: ${nomeCarro} (site)` : "Financiamento (site)",
    valorCents: carro?.precoCents ?? 0,
    origem: "Site · Financiamento",
    tarefa: `Simular financiamento com ${primeiroNome(input.nome)}${nomeCarro ? ` para o ${nomeCarro}` : ""}${detalhes ? `: ${detalhes}` : ""}`,
  });
}
