import { prisma } from "@dilon-zap/db";
import { NOME_DO_PORTAL } from "@/lib/lead-portal";
import { diaDeBrasilia } from "@/lib/estatisticas-vitrine";
import { ESTAGIOS, ORDEM_DA_ATENCAO, autorDaMensagem, estagioDoLead, rotuloDoEstagio, textoDaAtencao, tipoDoMotivoDaIa, type Estagio, type MensagemDoLead, type Situacao } from "@/lib/estagio-lead";

/**
 * Veículos > Leads: o painel de quem precisa de atenção hoje e de quão rápido a loja responde os leads dos portais.
 * Só leitura; nada aqui manda mensagem. A conta de "respondeu" não depende de ninguém apertar botão: vale a primeira
 * mensagem de uma PESSOA da loja (Inbox ou celular) ou do Vendedor IA no WhatsApp depois que o lead chegou, ou o
 * "Já respondi" (para quem chamou por ligação). Mensagem automática (menu, saudação) não conta.
 *
 * Faixas do tempo de resposta (as mesmas do AutoCerto, para a loja comparar): até 15 min excelente, até 30 atenção,
 * mais que isso crítico. Lead sem resposta há mais de 30 min conta como crítico; antes disso, "aguardando".
 */

export const LIMITE_EXCELENTE_MIN = 15;
export const LIMITE_ATENCAO_MIN = 30;
const DIA_MS = 86_400_000;
const JANELA_ATENCAO_DIAS = 30;

export type FaixaDoTempo = "excelente" | "atencao" | "critico";

export function faixaDoTempo(minutos: number): FaixaDoTempo {
  if (minutos <= LIMITE_EXCELENTE_MIN) return "excelente";
  if (minutos <= LIMITE_ATENCAO_MIN) return "atencao";
  return "critico";
}

/** A mediana (a média engana: um lead de 4 dias estraga a conta de dez respondidos em 5 minutos). */
export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

const minutosEntre = (de: Date, ate: Date) => Math.max(0, Math.round((ate.getTime() - de.getTime()) / 60_000));

export type LeadDoTempo = { recebidoEm: Date; respostaEm: Date | null };

export function resumoDoTempo(leads: LeadDoTempo[], agora: Date) {
  const r = { total: leads.length, respondidos: 0, semResposta: 0, excelente: 0, atencao: 0, critico: 0, aguardando: 0, medianaMin: null as number | null };
  const tempos: number[] = [];
  for (const l of leads) {
    if (l.respostaEm) {
      const min = minutosEntre(l.recebidoEm, l.respostaEm);
      r.respondidos++;
      r[faixaDoTempo(min)]++;
      tempos.push(min);
    } else {
      r.semResposta++;
      if (minutosEntre(l.recebidoEm, agora) > LIMITE_ATENCAO_MIN) r.critico++;
      else r.aguardando++;
    }
  }
  r.medianaMin = mediana(tempos);
  return r;
}

/** Variação em % (null quando não há base de comparação). */
export function variacaoEmPercentual(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/** Um lead no painel, venha ele de um portal ou de uma conversa de WhatsApp: o mesmo formato para as contas de baixo. */
type ItemDoPainel = {
  id: string;
  tipo: "portal" | "whatsapp";
  /** Chave da origem: o portal (NAPISTA...) ou "WHATSAPP". */
  origem: string;
  origemNome: string;
  nome: string;
  recebidoEm: Date;
  semTelefone: boolean;
  veiculoId: string | null;
  negociacaoId: string | null;
  conversaId: string | null;
  vendedorId: string | null;
  vendedorNome: string | null;
  ganha: boolean;
  respostaEm: Date | null;
  situacao: Situacao;
};

/**
 * Conversas de WhatsApp que começaram pelo cliente e não vieram de um portal também são leads: quem chama a loja no
 * número geral é cliente em potencial, com ou sem anúncio. Conta a partir da primeira mensagem DO CLIENTE; conversa que a
 * própria loja abriu, grupo e número de setor ficam de fora, e o contato que já é lead de portal não conta duas vezes.
 * O estágio sai da conversa pelas mesmas regras dos leads de portal (estagio-lead.ts).
 */
async function leadsDeWhatsapp(p: { tenantId: string; janela: Date; agora: Date; contatosDosPortais: Set<string> }): Promise<ItemDoPainel[]> {
  const { tenantId, janela, agora } = p;
  const conversas = await prisma.conversation.findMany({
    where: {
      tenantId,
      createdAt: { gte: janela },
      session: { setorId: null },
      contact: { grupo: false },
      ...(p.contatosDosPortais.size ? { contactId: { notIn: [...p.contatosDosPortais] } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 3000,
    select: { id: true, contactId: true, assignedTo: { select: { id: true, name: true } }, contact: { select: { name: true } } },
  });
  if (!conversas.length) return [];
  const ids = conversas.map((c) => c.id);

  // A primeira mensagem de TODAS, não só da janela: há conversas com o histórico mais antigo que a própria conversa (sincronia
  // do WhatsApp). Se a janela cortasse o começo, uma mensagem do meio viraria "a primeira" e a conversa antiga pareceria lead novo.
  const comeco = await prisma.message.groupBy({ by: ["conversationId"], where: { conversationId: { in: ids }, status: { not: "FAILED" } }, _min: { createdAt: true } });
  const comecoDaConversa = new Map(comeco.map((g) => [g.conversationId, g._min.createdAt]));

  const mensagens = await prisma.message.findMany({
    where: { conversationId: { in: ids }, createdAt: { gte: janela, lte: agora }, status: { not: "FAILED" } },
    orderBy: { createdAt: "asc" },
    take: 200_000,
    select: { conversationId: true, createdAt: true, direction: true, senderUserId: true, deCelular: true, referenciaExterna: true },
  });
  const porConversa = new Map<string, typeof mensagens>();
  for (const m of mensagens) porConversa.set(m.conversationId, [...(porConversa.get(m.conversationId) ?? []), m]);

  const passagens = await prisma.vendedorIaConversa.findMany({ where: { tenantId, conversationId: { in: ids }, status: "TRANSFERIDA" }, select: { conversationId: true, motivo: true, transferidaEm: true } });
  const passagemDaConversa = new Map(passagens.map((x) => [x.conversationId, x]));

  // A negociação que o time abriu para este contato depois que ele chamou: diz se a venda foi ganha ou perdida.
  const negociacoes = await prisma.negociacao.findMany({
    where: { tenantId, contactId: { in: [...new Set(conversas.map((c) => c.contactId))] }, createdAt: { gte: janela } },
    orderBy: { createdAt: "desc" },
    select: { id: true, contactId: true, status: true, createdAt: true },
  });
  const comFicha = new Set(
    negociacoes.length ? (await prisma.fichaFinanciamento.findMany({ where: { tenantId, negociacaoId: { in: negociacoes.map((n) => n.id) } }, select: { negociacaoId: true } })).map((f) => f.negociacaoId) : []
  );

  const itens: ItemDoPainel[] = [];
  for (const c of conversas) {
    const msgs = porConversa.get(c.id) ?? [];
    const primeira = msgs[0];
    // Só é lead se quem abriu a conversa foi o cliente.
    const comecou = comecoDaConversa.get(c.id);
    if (!primeira || primeira.direction !== "INBOUND" || !comecou || comecou < janela) continue;
    const recebidoEm = primeira.createdAt;
    const passagem = passagemDaConversa.get(c.id);
    const tipoDaPassagem = passagem && (!passagem.transferidaEm || passagem.transferidaEm >= recebidoEm) ? tipoDoMotivoDaIa(passagem.motivo) : null;
    const neg = negociacoes.find((n) => n.contactId === c.contactId && n.createdAt >= recebidoEm) ?? null;
    const situacao = estagioDoLead(
      {
        recebidoEm,
        respondidoManualEm: null,
        // A primeira mensagem do cliente é o lead chegando, não "o cliente respondeu".
        mensagens: msgs.slice(1).map((m) => ({ de: autorDaMensagem(m), em: m.createdAt })),
        statusNegociacao: neg?.status ?? null,
        iaPassouEm: tipoDaPassagem ? passagem!.transferidaEm : null,
        iaPassouTipo: tipoDaPassagem,
        temFichaFinanciamento: !!neg && comFicha.has(neg.id),
      },
      agora
    );
    itens.push({
      id: c.id,
      tipo: "whatsapp",
      origem: "WHATSAPP",
      origemNome: "WhatsApp (conversa direta)",
      nome: c.contact.name?.trim() || "Sem nome",
      recebidoEm,
      semTelefone: false,
      veiculoId: null,
      negociacaoId: neg?.id ?? null,
      conversaId: c.id,
      vendedorId: c.assignedTo?.id ?? null,
      vendedorNome: c.assignedTo?.name ?? null,
      ganha: neg?.status === "GANHA",
      respostaEm: situacao.respostaEm,
      situacao,
    });
  }
  return itens;
}

export async function painelDeLeads(tenantId: string, dias: number, agora: Date = new Date(), opcoes: { whatsapp?: boolean } = {}) {
  const inicio = new Date(agora.getTime() - dias * DIA_MS);
  const janela = new Date(agora.getTime() - Math.max(dias * 2, JANELA_ATENCAO_DIAS) * DIA_MS);

  const leads = await prisma.leadPortal.findMany({
    where: { tenantId, recebidoEm: { gte: janela, lte: agora } },
    orderBy: { recebidoEm: "asc" },
    take: 5000,
    select: { id: true, portal: true, nome: true, recebidoEm: true, respondidoEm: true, semTelefone: true, negociacaoId: true, veiculoId: true },
  });

  const negIds = [...new Set(leads.map((l) => l.negociacaoId).filter((v): v is string => !!v))];
  const negociacoes = negIds.length
    ? await prisma.negociacao.findMany({ where: { tenantId, id: { in: negIds } }, select: { id: true, contactId: true, responsavelId: true, status: true, responsavel: { select: { name: true } } } })
    : [];
  const negPorId = new Map(negociacoes.map((n) => [n.id, n]));

  const contatoIds = [...new Set(negociacoes.map((n) => n.contactId))];
  const conversas = contatoIds.length
    ? await prisma.conversation.findMany({ where: { tenantId, contactId: { in: contatoIds } }, orderBy: { lastMessageAt: "desc" }, select: { id: true, contactId: true } })
    : [];
  const conversasDoContato = new Map<string, string[]>();
  for (const c of conversas) conversasDoContato.set(c.contactId, [...(conversasDoContato.get(c.contactId) ?? []), c.id]);
  const contatoDaConversa = new Map(conversas.map((c) => [c.id, c.contactId]));

  // Todas as mensagens da conversa do contato, nos dois sentidos: resposta da loja (pessoa, celular ou Vendedor IA),
  // mensagem do cliente e automações (menu, saudação), que não contam. É daqui que o estágio sai sozinho.
  const mensagens = conversas.length
    ? await prisma.message.findMany({
        where: { conversationId: { in: conversas.map((c) => c.id) }, createdAt: { gte: janela }, status: { not: "FAILED" } },
        orderBy: { createdAt: "asc" },
        take: 100_000,
        select: { conversationId: true, createdAt: true, direction: true, senderUserId: true, deCelular: true, referenciaExterna: true },
      })
    : [];
  const mensagensDoContato = new Map<string, MensagemDoLead[]>();
  for (const m of mensagens) {
    const contato = contatoDaConversa.get(m.conversationId);
    if (contato) mensagensDoContato.set(contato, [...(mensagensDoContato.get(contato) ?? []), { de: autorDaMensagem(m), em: m.createdAt }]);
  }

  // O que a IA identificou ao passar a conversa para a equipe (visita, negociação...), e as fichas de financiamento.
  const passagens = conversas.length
    ? await prisma.vendedorIaConversa.findMany({ where: { tenantId, conversationId: { in: conversas.map((c) => c.id) }, status: "TRANSFERIDA" }, select: { conversationId: true, motivo: true, transferidaEm: true } })
    : [];
  const passagensDoContato = new Map<string, { motivo: string | null; em: Date | null }[]>();
  for (const p of passagens) {
    const contato = contatoDaConversa.get(p.conversationId);
    if (contato) passagensDoContato.set(contato, [...(passagensDoContato.get(contato) ?? []), { motivo: p.motivo, em: p.transferidaEm }]);
  }
  const comFicha = new Set(
    negIds.length ? (await prisma.fichaFinanciamento.findMany({ where: { tenantId, negociacaoId: { in: negIds } }, select: { negociacaoId: true } })).map((f) => f.negociacaoId) : []
  );

  const dosPortais: ItemDoPainel[] = leads.map((l) => {
    const neg = l.negociacaoId ? negPorId.get(l.negociacaoId) ?? null : null;
    // Só vale a passagem para a equipe que aconteceu depois que este lead chegou, e a mais recente que diga o que o cliente quer.
    const passagem = neg
      ? (passagensDoContato.get(neg.contactId) ?? [])
          .filter((p) => tipoDoMotivoDaIa(p.motivo) !== null && (!p.em || p.em >= l.recebidoEm))
          .sort((a, b) => (b.em?.getTime() ?? 0) - (a.em?.getTime() ?? 0))[0] ?? null
      : null;
    const situacao = estagioDoLead(
      {
        recebidoEm: l.recebidoEm,
        respondidoManualEm: l.respondidoEm,
        mensagens: neg ? mensagensDoContato.get(neg.contactId) ?? [] : [],
        statusNegociacao: neg?.status ?? null,
        iaPassouEm: passagem?.em ?? null,
        iaPassouTipo: passagem ? tipoDoMotivoDaIa(passagem.motivo) : null,
        temFichaFinanciamento: !!neg && comFicha.has(neg.id),
      },
      agora
    );
    return {
      id: l.id,
      tipo: "portal",
      origem: l.portal,
      origemNome: NOME_DO_PORTAL[l.portal],
      nome: l.nome,
      recebidoEm: l.recebidoEm,
      semTelefone: l.semTelefone,
      veiculoId: l.veiculoId,
      negociacaoId: l.negociacaoId,
      conversaId: neg ? conversasDoContato.get(neg.contactId)?.[0] ?? null : null,
      vendedorId: neg?.responsavelId ?? null,
      vendedorNome: neg?.responsavel?.name ?? null,
      ganha: neg?.status === "GANHA",
      respostaEm: situacao.respostaEm,
      situacao,
    };
  });

  // Conversas de WhatsApp que começaram pelo cliente e não são de um contato que já é lead de portal.
  const dosWhatsapp = opcoes.whatsapp === false ? [] : await leadsDeWhatsapp({ tenantId, janela, agora, contatosDosPortais: new Set(contatoIds) });
  const calculados: ItemDoPainel[] = [...dosPortais, ...dosWhatsapp].sort((a, b) => a.recebidoEm.getTime() - b.recebidoEm.getTime());

  const doPeriodo = calculados.filter((l) => l.recebidoEm >= inicio);
  const doPeriodoAnterior = calculados.filter((l) => l.recebidoEm < inicio && l.recebidoEm >= new Date(inicio.getTime() - dias * DIA_MS));
  const recentes = calculados.filter((l) => l.recebidoEm >= new Date(agora.getTime() - JANELA_ATENCAO_DIAS * DIA_MS));

  const tempo = resumoDoTempo(doPeriodo, agora);
  const tempoAnterior = resumoDoTempo(doPeriodoAnterior, agora);
  const semRespostaAgora = recentes.filter((l) => !l.respostaEm);

  // Os que pedem uma pessoa agora: o que a automação não resolve. O que a IA passou para a equipe vem primeiro (é quem
  // quer comprar), depois o cliente esperando resposta, depois o sem resposta; dentro de cada grupo, o mais novo.
  const comAtencao = recentes
    .filter((l) => l.situacao.precisaDeGente)
    .sort((a, b) => {
      const pa = a.situacao.precisaDeGente!;
      const pb = b.situacao.precisaDeGente!;
      return ORDEM_DA_ATENCAO[pa.motivo] - ORDEM_DA_ATENCAO[pb.motivo] || pb.desde.getTime() - pa.desde.getTime();
    });
  const precisamDeGente = comAtencao.slice(0, 15);
  const carroIds = [...new Set(precisamDeGente.map((l) => l.veiculoId).filter((v): v is string => !!v))];
  const carros = new Map((carroIds.length ? await prisma.veiculo.findMany({ where: { tenantId, id: { in: carroIds } }, select: { id: true, marca: true, modelo: true, anoModelo: true } }) : []).map((c) => [c.id, `${c.marca} ${c.modelo} ${c.anoModelo}`]));

  const porOrigem = new Map<string, typeof doPeriodo>();
  for (const l of doPeriodo) porOrigem.set(l.origem, [...(porOrigem.get(l.origem) ?? []), l]);
  const origem = [...porOrigem.entries()]
    .map(([portal, ls]) => {
      const t = resumoDoTempo(ls, agora);
      return {
        portal,
        nome: ls[0].origemNome,
        leads: ls.length,
        percentual: doPeriodo.length ? Math.round((ls.length / doPeriodo.length) * 1000) / 10 : 0,
        respondidos: t.respondidos,
        medianaMin: t.medianaMin,
        vendas: ls.filter((l) => l.ganha).length,
      };
    })
    .sort((a, b) => b.leads - a.leads);

  const porVendedor = new Map<string, { id: string | null; nome: string; leads: typeof doPeriodo }>();
  for (const l of doPeriodo) {
    const chave = l.vendedorId ?? "sem";
    const atual = porVendedor.get(chave) ?? { id: l.vendedorId, nome: l.vendedorNome ?? "Sem vendedor definido", leads: [] };
    atual.leads.push(l);
    porVendedor.set(chave, atual);
  }
  // Quem só tem lead sem resposta fora do período também precisa aparecer.
  for (const l of semRespostaAgora) {
    const chave = l.vendedorId ?? "sem";
    if (!porVendedor.has(chave)) porVendedor.set(chave, { id: l.vendedorId, nome: l.vendedorNome ?? "Sem vendedor definido", leads: [] });
  }
  const vendedores = [...porVendedor.entries()]
    .map(([chave, v]) => ({
      id: v.id,
      nome: v.nome,
      leads: v.leads.length,
      semRespostaAgora: semRespostaAgora.filter((l) => (l.vendedorId ?? "sem") === chave).length,
      medianaMin: resumoDoTempo(v.leads, agora).medianaMin,
    }))
    .sort((a, b) => b.semRespostaAgora - a.semRespostaAgora || b.leads - a.leads);

  // Leads por dia (14 dias, no horário de Brasília).
  const porDia: { dia: string; leads: number }[] = [];
  const hoje = diaDeBrasilia(agora);
  for (let i = 13; i >= 0; i--) porDia.push({ dia: new Date(hoje.getTime() - i * DIA_MS).toISOString().slice(0, 10), leads: 0 });
  for (const l of calculados) {
    const chave = diaDeBrasilia(l.recebidoEm).toISOString().slice(0, 10);
    const p = porDia.find((x) => x.dia === chave);
    if (p) p.leads++;
  }

  // Entre os respondidos, quantos em até 15 min (os sem resposta não entram nesta conta).
  const base = tempo.respondidos;
  return {
    dias,
    recebidos: doPeriodo.length,
    recebidosAnterior: doPeriodoAnterior.length,
    variacaoRecebidos: variacaoEmPercentual(doPeriodo.length, doPeriodoAnterior.length),
    semTelefone: doPeriodo.filter((l) => l.semTelefone).length,
    /** Sem resposta nos últimos 30 dias, qualquer que seja o período escolhido. */
    nuncaAtendidos: semRespostaAgora.length,
    medianaMin: tempo.medianaMin,
    medianaAnteriorMin: tempoAnterior.medianaMin,
    percentualAte15Min: base ? Math.round((tempo.excelente / base) * 100) : null,
    tempo: { excelente: tempo.excelente, atencao: tempo.atencao, critico: tempo.critico, aguardando: tempo.aguardando, respondidos: tempo.respondidos },
    /** Quem uma pessoa precisa ver agora (últimos 30 dias): total e os 15 mais quentes. */
    precisamDeGenteTotal: comAtencao.length,
    precisamDeGente: precisamDeGente.map((l) => {
      const p = l.situacao.precisaDeGente!;
      return {
        id: l.id,
        nome: l.nome,
        portal: l.origemNome,
        tipo: l.tipo,
        carro: l.veiculoId ? carros.get(l.veiculoId) ?? null : null,
        recebidoEm: l.recebidoEm.toISOString(),
        estagio: l.situacao.estagio,
        rotuloDoEstagio: rotuloDoEstagio(l.situacao.estagio),
        motivo: p.motivo,
        textoDoMotivo: textoDaAtencao(p.motivo, l.situacao.estagio),
        esperaMin: minutosEntre(p.desde, agora),
        semTelefone: l.semTelefone,
        negociacaoId: l.negociacaoId,
        conversaId: l.conversaId,
        vendedor: l.vendedorNome,
      };
    }),
    /** O funil que anda sozinho, no período: cada passo é deduzido da conversa, ninguém precisa clicar. */
    funil: {
      recebidos: doPeriodo.length,
      respondidos: doPeriodo.filter((l) => l.situacao.respostaEm).length,
      conversaram: doPeriodo.filter((l) => l.situacao.clienteEscreveu).length,
      querAvancar: doPeriodo.filter((l) => l.situacao.querAvancar || l.situacao.estagio === "GANHO").length,
      ganhos: doPeriodo.filter((l) => l.situacao.estagio === "GANHO").length,
      perdidos: doPeriodo.filter((l) => l.situacao.estagio === "PERDIDO").length,
    },
    porEstagio: ESTAGIOS.map((e) => ({ estagio: e.estagio as Estagio, rotulo: e.rotulo, descricao: e.descricao, leads: doPeriodo.filter((l) => l.situacao.estagio === e.estagio).length })),
    origem,
    vendedores,
    porDia,
  };
}
