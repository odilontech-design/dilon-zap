import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { z } from "zod";
import { DESCRICAO_DO_PRODUTO, ErroSdrCore, executarTarefaIa, inicioDoMes, NOME_DO_PRODUTO, normalizarValorDeSupressao, obterConfigIa, registrarNota, registrarResultado, type Provedores } from "@dilon-zap/sdr-core";
import { ACOES_DO_VENDEDOR, esquemaDaResposta, montarSistema, TAREFA_DO_VENDEDOR, TEXTO_DE_DESCADASTRO, VERSAO_DO_PROMPT_DO_VENDEDOR, type AcaoDoVendedor } from "./prompt";
import { decidir, linksNaoPermitidos, montarHistorico, paraWhatsApp, PREFIXO_DA_IA, VELHA_MS, type MensagemDaConversa } from "./regras";

/**
 * O vendedor de SaaS do SDR. Roda no vendedor-ia-worker (processo próprio, fora do núcleo do SDR, que continua sem tocar em conversa nem mensagem).
 *
 * Não envia nada direto ao WhatsApp: grava a resposta como mensagem PENDING na conversa, e o worker do WhatsApp a
 * manda, como já faz com o Vendedor IA de carros. A conversa aparece normal no Inbox.
 *
 * Só atende conversas de empresas do SDR (contato com negociação de origem "SDR" ligada a um acompanhamento ainda
 * em andamento) que RESPONDERAM a uma abordagem feita por uma pessoa. Não puxa assunto, respeita horário, sai quando
 * a equipe fala e passa para uma pessoa nos casos que o roteiro não cobre.
 */

type Autor = { id: string; name: string };
const AUTOR_DA_IA: Autor = { id: "vendedor-saas", name: "Vendedor IA" };
const JANELA = 40;
/** Etapas em que a empresa ainda está em conversa com a IA; REUNIAO em diante já é de uma pessoa. */
const ETAPAS_ATENDIVEIS = ["CONTATADA", "RESPONDEU", "INFO_SOLICITADA", "INTERESSE"] as const;
const ORDEM_DA_ETAPA: Record<string, number> = { CONTATADA: 1, RESPONDEU: 2, INFO_SOLICITADA: 3, INTERESSE: 4, REUNIAO: 5 };
const ETAPA_DA_ACAO: Partial<Record<AcaoDoVendedor, "RESPONDEU" | "INTERESSE" | "REUNIAO" | "SEM_INTERESSE" | "NAO_CONTATAR">> = {
  continuar: "RESPONDEU",
  interesse: "INTERESSE",
  demonstracao: "REUNIAO",
  sem_interesse: "SEM_INTERESSE",
  nao_contatar: "NAO_CONTATAR",
};
const SITE_DA_DILON = "https://dilontech.com.br";
const TEXTO_DE_TRANSFERENCIA = "Vou pedir para um colega da nossa equipe continuar a conversa por aqui. Em breve ele retorna.";
/** Falhas seguidas do provedor antes de passar para uma pessoa, e quanto esperar entre elas. */
const MAX_TENTATIVAS = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = [30_000, 120_000, 0];

/* ------------------------------------------------------------ Configuração ---- */

export const configDoVendedorSchema = z
  .object({
    ativo: z.boolean(),
    modo: z.enum(["SUGERIR", "AUTOMATICO"]),
    nomeAssistente: z.string().trim().min(2).max(60),
    instrucoes: z
      .string()
      .trim()
      .max(3000)
      .nullable()
      .optional()
      .transform((v) => v || null),
    limiteTurnos: z.number().int().min(1).max(30),
    horaInicio: z.number().int().min(0).max(23),
    horaFim: z.number().int().min(1).max(24),
  })
  .strict()
  .refine((c) => c.horaFim > c.horaInicio, { message: "o horário final precisa ser depois do inicial", path: ["horaFim"] });

export type ConfigDoVendedor = z.infer<typeof configDoVendedorSchema> & { tenantId: string; ativadoEm: Date | null };

export async function obterConfigDoVendedor(tenantId: string): Promise<ConfigDoVendedor> {
  const l = await prisma.sdrVendedorConfig.findUnique({ where: { tenantId } });
  return {
    tenantId,
    ativo: l?.ativo ?? false,
    modo: l?.modo ?? "SUGERIR",
    ativadoEm: l?.ativadoEm ?? null,
    nomeAssistente: l?.nomeAssistente ?? "Assistente da Dilon Tech",
    instrucoes: l?.instrucoes ?? null,
    limiteTurnos: l?.limiteTurnos ?? 8,
    horaInicio: l?.horaInicio ?? 8,
    horaFim: l?.horaFim ?? 20,
  };
}

export async function salvarConfigDoVendedor(tenantId: string, bruto: unknown, autor: Autor): Promise<ConfigDoVendedor> {
  const d = configDoVendedorSchema.parse(bruto);
  if (d.ativo) {
    const ia = await obterConfigIa(tenantId);
    if (!ia.ativa || !ia.modelos[TAREFA_DO_VENDEDOR]) {
      throw new ErroSdrCore(`ligue a IA do SDR e escolha o modelo da tarefa ${TAREFA_DO_VENDEDOR} antes de ligar o vendedor`, 422);
    }
  }
  const atual = await prisma.sdrVendedorConfig.findUnique({ where: { tenantId } });
  // Ligar de novo conta como ligar pela primeira vez: respostas que chegaram enquanto estava desligado não são atendidas.
  const ativadoEm = d.ativo ? (atual?.ativo && atual.ativadoEm ? atual.ativadoEm : new Date()) : (atual?.ativadoEm ?? null);
  const valores = { ...d, ativadoEm, atualizadoPorId: autor.id, atualizadoPorNome: autor.name };
  await prisma.sdrVendedorConfig.upsert({ where: { tenantId }, create: { tenantId, ...valores }, update: valores });
  return obterConfigDoVendedor(tenantId);
}

/* ------------------------------------------------------------------ Painel ---- */

export async function listarConversasDoVendedor(tenantId: string) {
  const [linhas, doMes] = await Promise.all([
    prisma.sdrVendedorConversa.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.sdrVendedorConversa.groupBy({ by: ["status"], where: { tenantId, iniciadaEm: { gte: inicioDoMes(new Date()) } }, _count: { _all: true } }),
  ]);
  const ids = linhas.map((l) => l.conversationId);
  const empresaIds = [...new Set(linhas.map((l) => l.empresaId).filter((x): x is string => !!x))];
  const [empresas, entradas] = await Promise.all([
    empresaIds.length ? prisma.sdrEmpresa.findMany({ where: { tenantId, id: { in: empresaIds } }, select: { id: true, nomeFantasia: true, razaoSocial: true, cidade: true, uf: true } }) : [],
    ids.length ? prisma.message.findMany({ where: { conversationId: { in: ids }, direction: "INBOUND" }, orderBy: { createdAt: "desc" }, take: 300, select: { conversationId: true, body: true, createdAt: true } }) : [],
  ]);
  const empresa = new Map(empresas.map((e) => [e.id, e]));
  // Conversa ligada à mão fora do SDR não tem empresa: o painel mostra o nome do contato.
  const contatos = new Map(
    (ids.length ? await prisma.conversation.findMany({ where: { tenantId, id: { in: linhas.filter((l) => !l.empresaId).map((l) => l.conversationId) } }, select: { id: true, contact: { select: { name: true } } } }) : []).map((c) => [c.id, c.contact.name])
  );
  const ultima = new Map<string, { body: string; createdAt: Date }>();
  for (const m of entradas) if (!ultima.has(m.conversationId)) ultima.set(m.conversationId, m);
  const mes = Object.fromEntries(doMes.map((g) => [g.status, g._count._all])) as Record<string, number>;
  return {
    resumoDoMes: { atendidas: (mes.ATIVA ?? 0) + (mes.TRANSFERIDA ?? 0) + (mes.ENCERRADA ?? 0), ativas: mes.ATIVA ?? 0, transferidas: mes.TRANSFERIDA ?? 0, encerradas: mes.ENCERRADA ?? 0 },
    itens: linhas.map((l) => {
      const e = l.empresaId ? empresa.get(l.empresaId) : undefined;
      return {
        conversationId: l.conversationId,
        empresaId: l.empresaId,
        empresa: e?.nomeFantasia ?? e?.razaoSocial ?? contatos.get(l.conversationId) ?? "Contato",
        local: [e?.cidade, e?.uf].filter(Boolean).join(" / ") || null,
        status: l.status,
        motivo: l.motivo,
        resumo: l.resumo,
        turnos: l.turnos,
        sugestao: l.sugestao,
        sugestaoAcao: l.sugestaoAcao,
        sugestaoEm: l.sugestaoEm,
        ultimaDaEmpresa: ultima.get(l.conversationId)?.body.slice(0, 300) ?? null,
        atualizadaEm: l.updatedAt,
      };
    }),
  };
}

/* ------------------------------------------------------------------- Ciclo ---- */

export type DependenciasDoVendedor = {
  provedores?: Provedores;
  /** Acorda a fila de saída do worker do WhatsApp (o envio sai na hora em vez de no próximo ciclo). */
  acordarFila?: (tenantId: string) => Promise<void>;
  agora?: () => Date;
};

export type ResultadoDoCicloDoVendedor = { respondidas: number; sugeridas: number; transferidas: number; erros: number };
type Desfecho = "respondida" | "sugerida" | "transferida" | null;
type Conversa = { id: string; tenantId: string; sessionId: string; setorId: string | null };

type Candidato = { conversationId: string; empresaId: string | null; controle: "LIGADO" | null; campanhaId: string | null };

/**
 * As conversas que o vendedor pode atender agora:
 *  - as ligadas à mão no Inbox (controle LIGADO), de qualquer contato, mesmo fora do SDR;
 *  - as do SDR: contato com negociação de origem "SDR" ligada a um acompanhamento ainda em andamento, com mensagem depois de o
 *    vendedor ser ligado na empresa.
 * As desligadas à mão (controle DESLIGADO, o freio) nunca entram, nem pelo automático.
 */
async function conversasCandidatas(tenantId: string, ativadoEm: Date, agora: Date): Promise<Candidato[]> {
  const desde = new Date(agora.getTime() - VELHA_MS);
  const conversas = await prisma.conversation.findMany({
    where: { tenantId, lastMessageAt: { gt: desde }, contact: { grupo: false } },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    select: { id: true, contactId: true, lastMessageAt: true },
  });
  if (!conversas.length) return [];
  const controles = await prisma.conversaAgente.findMany({ where: { tenantId, conversationId: { in: conversas.map((c) => c.id) } }, select: { conversationId: true, estado: true, campanhaId: true } });
  const controleDe = new Map(controles.map((c) => [c.conversationId, c]));

  const negociacoes = await prisma.negociacao.findMany({ where: { tenantId, origem: "SDR", contactId: { in: [...new Set(conversas.map((c) => c.contactId))] } }, select: { id: true, contactId: true } });
  const acompanhamentos = negociacoes.length
    ? await prisma.sdrAcompanhamento.findMany({ where: { tenantId, negociacaoId: { in: negociacoes.map((n) => n.id) } }, select: { empresaId: true, negociacaoId: true, etapa: true } })
    : [];
  const acompDaNegociacao = new Map(acompanhamentos.map((a) => [a.negociacaoId!, a]));
  const negociacaoDoContato = new Map(negociacoes.map((n) => [n.contactId, n.id]));

  return conversas.flatMap((c): Candidato[] => {
    const ctl = controleDe.get(c.id);
    if (ctl?.estado === "DESLIGADO") return [];
    const acomp = acompDaNegociacao.get(negociacaoDoContato.get(c.contactId) ?? "");
    if (ctl?.estado === "LIGADO") return [{ conversationId: c.id, empresaId: acomp?.empresaId ?? null, controle: "LIGADO", campanhaId: ctl.campanhaId }];
    if (!acomp || !(ETAPAS_ATENDIVEIS as readonly string[]).includes(acomp.etapa) || c.lastMessageAt <= ativadoEm) return [];
    return [{ conversationId: c.id, empresaId: acomp.empresaId, controle: null, campanhaId: null }];
  });
}

export async function cicloDoVendedor(deps: DependenciasDoVendedor = {}): Promise<ResultadoDoCicloDoVendedor> {
  const agora = deps.agora?.() ?? new Date();
  const r: ResultadoDoCicloDoVendedor = { respondidas: 0, sugeridas: 0, transferidas: 0, erros: 0 };
  const liberadas = await prisma.tenantRecurso.findMany({ where: { recurso: "SDR", ativo: true }, select: { tenantId: true } });
  if (!liberadas.length) return r;
  const configs = await prisma.sdrVendedorConfig.findMany({ where: { tenantId: { in: liberadas.map((l) => l.tenantId) }, ativo: true, ativadoEm: { not: null } } });

  for (const cfg of configs) {
    // Sem a IA do SDR ligada e com o modelo da tarefa, nenhuma chamada: evita registrar uma recusa a cada ciclo.
    const ia = await obterConfigIa(cfg.tenantId);
    if (!ia.ativa || !ia.modelos[TAREFA_DO_VENDEDOR]) continue;
    const config: ConfigDoVendedor = { ...(await obterConfigDoVendedor(cfg.tenantId)), ativadoEm: cfg.ativadoEm };
    for (const c of await conversasCandidatas(cfg.tenantId, cfg.ativadoEm!, agora)) {
      try {
        const d = await atenderConversa(c, config, deps, agora);
        if (d === "respondida") r.respondidas++;
        else if (d === "sugerida") r.sugeridas++;
        else if (d === "transferida") r.transferidas++;
      } catch (e) {
        r.erros++;
        console.error(`[vendedor-saas] conversa ${c.conversationId}:`, e instanceof Error ? e.message : e);
        await registrarFalha(cfg.tenantId, c.conversationId, c.empresaId, agora).catch(() => undefined);
      }
    }
  }
  return r;
}

/** Falha inesperada: espera um pouco e tenta de novo; na terceira, passa para uma pessoa. */
async function registrarFalha(tenantId: string, conversationId: string, empresaId: string | null, agora: Date) {
  const atual = await prisma.sdrVendedorConversa.findUnique({ where: { conversationId } });
  const tentativas = (atual?.tentativas ?? 0) + 1;
  if (tentativas >= MAX_TENTATIVAS) {
    const c = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true, tenantId: true, sessionId: true, setorId: true } });
    if (c) await transferir({ conversa: c, empresaId, agora }, "falha repetida da IA", null);
    return;
  }
  const proxima = new Date(agora.getTime() + ESPERA_ENTRE_TENTATIVAS_MS[tentativas - 1]);
  await prisma.sdrVendedorConversa.upsert({
    where: { conversationId },
    create: { iniciadaEm: agora, conversationId, tenantId, empresaId, tentativas, proximaTentativaEm: proxima },
    update: { tentativas, proximaTentativaEm: proxima },
  });
}

async function atenderConversa(c: Candidato, cfg: ConfigDoVendedor, deps: DependenciasDoVendedor, agora: Date): Promise<Desfecho> {
  const { conversationId, empresaId } = c;
  const conversa = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true, tenantId: true, sessionId: true, setorId: true } });
  if (!conversa || conversa.tenantId !== cfg.tenantId) return null;

  const recentes = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: JANELA,
    select: { direction: true, body: true, mediaType: true, createdAt: true, senderUserId: true, deCelular: true, isDeleted: true, referenciaExterna: true },
  });
  const mensagens = recentes.reverse() as MensagemDaConversa[];
  const estado = await prisma.sdrVendedorConversa.findUnique({ where: { conversationId } });

  const decisao = decidir(
    {
      conversa: estado ? { status: estado.status, respondidoAte: estado.respondidoAte, turnos: estado.turnos, iniciadaEm: estado.iniciadaEm, proximaTentativaEm: estado.proximaTentativaEm } : null,
      mensagens,
      janela: JANELA,
      ativadoEm: cfg.ativadoEm!,
      limiteTurnos: cfg.limiteTurnos,
      horaInicio: cfg.horaInicio,
      horaFim: cfg.horaFim,
      controle: c.controle,
    },
    agora
  );
  const ctx = { conversa, empresaId, agora, cfg, deps, campanhaId: c.campanhaId, manual: c.controle === "LIGADO" };
  if (decisao.acao === "transferir") {
    await transferir(ctx, decisao.motivo, estado?.resumo ?? null);
    return "transferida";
  }
  if (decisao.acao !== "responder") return null;

  const historico = montarHistorico(mensagens);
  if (!historico) return null;
  const ultimaDaEmpresa = [...mensagens].reverse().find((m) => m.direction === "INBOUND")!.createdAt;
  return gerar(ctx, historico, ultimaDaEmpresa, estado?.turnos ?? 0);
}

type Contexto = {
  conversa: Conversa;
  /** Nulo quando o vendedor foi ligado à mão numa conversa que não é de empresa do SDR. */
  empresaId: string | null;
  agora: Date;
  cfg?: ConfigDoVendedor;
  deps?: DependenciasDoVendedor;
  /** Campanha escolhida ao ligar à mão (o roteiro). */
  campanhaId?: string | null;
  /** Ligado à mão no Inbox. */
  manual?: boolean;
};

const SELECAO_DA_CAMPANHA = { id: true, produto: true, publico: true, argumento: true, ofertas: true, provaSocial: true, objecoes: true, linkAgenda: true } as const;

/** A campanha mais recente da empresa que ainda não terminou: o roteiro de venda vem dela. */
async function campanhaDaEmpresa(tenantId: string, empresaId: string) {
  const p = await prisma.sdrProspecto.findFirst({
    where: { tenantId, empresaId, campanha: { status: { not: "ENCERRADA" } } },
    orderBy: { createdAt: "desc" },
    select: { campanha: { select: SELECAO_DA_CAMPANHA } },
  });
  return p?.campanha ?? null;
}

/**
 * O roteiro da conversa: a campanha escolhida ao ligar à mão, senão a da empresa do SDR. Ligado à mão e sem nenhuma das duas,
 * vale a campanha ativa mais recente (a pessoa pediu para o vendedor falar; sem roteiro ele transferiria quase tudo).
 * No automático, sem campanha da empresa, não há roteiro: a regra de sempre.
 */
async function campanhaDaConversa(tenantId: string, empresaId: string | null, campanhaId: string | null | undefined, manual: boolean) {
  if (campanhaId) {
    const c = await prisma.sdrCampanha.findFirst({ where: { id: campanhaId, tenantId }, select: SELECAO_DA_CAMPANHA });
    if (c) return c;
  }
  if (empresaId) {
    const c = await campanhaDaEmpresa(tenantId, empresaId);
    if (c) return c;
  }
  if (!manual) return null;
  return prisma.sdrCampanha.findFirst({ where: { tenantId, status: "ATIVA" }, orderBy: { createdAt: "desc" }, select: SELECAO_DA_CAMPANHA });
}

async function gerar(ctx: Contexto & { cfg: ConfigDoVendedor }, historico: { de: string; texto: string }[], ultimaDaEmpresa: Date, turnos: number): Promise<Desfecho> {
  const { conversa, empresaId, agora, cfg, deps } = ctx;
  const tenantId = conversa.tenantId;
  const [empresa, acomp, campanha, contato] = await Promise.all([
    empresaId ? prisma.sdrEmpresa.findFirst({ where: { id: empresaId, tenantId }, select: { nomeFantasia: true, razaoSocial: true, segmento: true, cidade: true, uf: true } }) : null,
    empresaId ? prisma.sdrAcompanhamento.findUnique({ where: { tenantId_empresaId: { tenantId, empresaId } }, select: { decisorNome: true, produto: true } }) : null,
    campanhaDaConversa(tenantId, empresaId, ctx.campanhaId, !!ctx.manual),
    // Conversa fora do SDR: só o nome do contato vai ao modelo (sem telefone).
    empresaId ? null : prisma.conversation.findUnique({ where: { id: conversa.id }, select: { contact: { select: { name: true } } } }),
  ]);
  if (empresaId && !empresa) return null;
  const produto = acomp?.produto ?? campanha?.produto ?? "DILON_ZAP";

  // Só o necessário vai ao modelo: sem telefone, e-mail nem CNPJ.
  const entrada = {
    empresa: { nome: empresa?.nomeFantasia ?? empresa?.razaoSocial ?? contato?.contact.name ?? "Contato", segmento: empresa?.segmento ?? null, cidade: empresa?.cidade ?? null, uf: empresa?.uf ?? null },
    decisor: acomp?.decisorNome ?? null,
    produto: { nome: NOME_DO_PRODUTO[produto], descricao: DESCRICAO_DO_PRODUTO[produto] },
    roteiro: {
      publico: campanha?.publico ?? null,
      argumento: campanha?.argumento ?? null,
      ofertas: campanha?.ofertas ?? null,
      provaSocial: campanha?.provaSocial ?? null,
      objecoes: Array.isArray(campanha?.objecoes) ? campanha.objecoes : [],
      linkAgenda: campanha?.linkAgenda ?? null,
    },
    respostasJaDadas: turnos,
    historico,
  };
  const sistema = montarSistema({ nomeAssistente: cfg.nomeAssistente, produto: NOME_DO_PRODUTO[produto], instrucoes: cfg.instrucoes });
  const r = await executarTarefaIa(
    { tenantId, campanhaId: campanha?.id ?? null, tarefa: TAREFA_DO_VENDEDOR, versaoPrompt: VERSAO_DO_PROMPT_DO_VENDEDOR, sistema, entrada, esquema: esquemaDaResposta },
    { provedores: deps?.provedores, agora: deps?.agora }
  );

  if (!r.ok) {
    // Orçamento acabou ou entrada grande demais: só uma pessoa resolve.
    if (r.motivo === "sem_orcamento" || r.motivo === "entrada_grande") {
      await transferir(ctx, `a IA não pôde responder: ${r.mensagem}`, null);
      return "transferida";
    }
    // Configuração (sem preço, tarefa inválida): espera um bom tempo, sem contar como falha do provedor.
    if (r.motivo === "sem_preco" || r.motivo === "tarefa_invalida" || r.motivo === "sem_modelo" || r.motivo === "desligada") {
      await prisma.sdrVendedorConversa.upsert({
        where: { conversationId: conversa.id },
        create: { iniciadaEm: agora, conversationId: conversa.id, tenantId, empresaId, proximaTentativaEm: new Date(agora.getTime() + 10 * 60_000) },
        update: { proximaTentativaEm: new Date(agora.getTime() + 10 * 60_000) },
      });
      return null;
    }
    throw new Error(`${r.motivo}: ${r.mensagem}`);
  }

  let { acao } = r.dados;
  const resumo = (r.dados.resumo ?? "").trim();
  let texto = acao === "nao_contatar" ? TEXTO_DE_DESCADASTRO : paraWhatsApp(r.dados.resposta);
  if (!texto) {
    acao = "transferir";
    texto = TEXTO_DE_TRANSFERENCIA;
  }
  // O link da agenda sai sempre que a empresa quer a demonstração, mesmo que o modelo tenha esquecido.
  if (acao === "demonstracao" && campanha?.linkAgenda && !texto.includes(campanha.linkAgenda)) texto = `${texto}\n\nÉ só escolher o melhor horário aqui: ${campanha.linkAgenda}`;
  const barrados = linksNaoPermitidos(texto, [campanha?.linkAgenda, SITE_DA_DILON]);
  if (barrados.length) {
    await transferir(ctx, "a IA citou um endereço que não está no roteiro; nada foi enviado", resumo || null);
    return "transferida";
  }

  if (cfg.modo === "SUGERIR") {
    await prisma.sdrVendedorConversa.upsert({
      where: { conversationId: conversa.id },
      create: { iniciadaEm: agora, conversationId: conversa.id, tenantId, empresaId, respondidoAte: ultimaDaEmpresa, resumo: resumo || null, sugestao: texto, sugestaoAcao: acao, sugestaoEm: agora },
      update: { respondidoAte: ultimaDaEmpresa, tentativas: 0, proximaTentativaEm: null, resumo: resumo || null, sugestao: texto, sugestaoAcao: acao, sugestaoEm: agora },
    });
    return "sugerida";
  }
  await executarAcao(ctx, { acao, texto, resumo }, ultimaDaEmpresa);
  return acao === "transferir" || acao === "demonstracao" ? "transferida" : "respondida";
}

/* -------------------------------------------------------------------- Ações ---- */

/** Sobe a etapa do acompanhamento (nunca desce) e deixa o resumo como nota. Encerramentos sempre valem. */
async function atualizarEtapa(tenantId: string, empresaId: string, etapa: NonNullable<ReturnType<typeof etapaDaAcao>>, resumo: string, agora: Date) {
  const atual = await prisma.sdrAcompanhamento.findUnique({ where: { tenantId_empresaId: { tenantId, empresaId } }, select: { etapa: true } });
  const encerra = etapa === "SEM_INTERESSE" || etapa === "NAO_CONTATAR";
  if (!encerra && (ORDEM_DA_ETAPA[atual?.etapa ?? ""] ?? 0) >= ORDEM_DA_ETAPA[etapa]) return;
  await registrarResultado(
    tenantId,
    empresaId,
    {
      etapa,
      nota: resumo ? `Vendedor IA: ${resumo}` : "Vendedor IA atendeu a resposta da empresa pelo WhatsApp.",
      ...(etapa === "REUNIAO" ? { proximaAcao: "Confirmar a demonstração (a empresa pediu pelo WhatsApp)", proximaAcaoEm: agora.toISOString() } : {}),
    },
    AUTOR_DA_IA
  );
}
const etapaDaAcao = (a: AcaoDoVendedor) => ETAPA_DA_ACAO[a];

async function enfileirar(ctx: Contexto, texto: string) {
  const { conversa } = ctx;
  await prisma.message.create({
    data: {
      conversationId: conversa.id,
      sessionId: conversa.sessionId,
      direction: "OUTBOUND",
      status: "PENDING",
      body: texto,
      setorId: conversa.setorId,
      referenciaExterna: `${PREFIXO_DA_IA}${randomUUID()}`,
      createdAt: ctx.agora,
    },
  });
  await prisma.conversation.update({ where: { id: conversa.id }, data: { lastMessageAt: ctx.agora } });
  await ctx.deps?.acordarFila?.(conversa.tenantId).catch(() => undefined);
}

/**
 * Executa o que a IA decidiu: efeitos no SDR, a mensagem e o estado da conversa. Os efeitos vêm ANTES do envio:
 * "não contatar" tem de entrar na lista de bloqueio, e se isso falhar nada é enviado e a conversa tenta de novo.
 */
async function executarAcao(ctx: Contexto, d: { acao: AcaoDoVendedor; texto: string; resumo: string }, ultimaDaEmpresa: Date | null) {
  const { conversa, empresaId, agora } = ctx;
  const tenantId = conversa.tenantId;
  const etapa = etapaDaAcao(d.acao);
  if (etapa && empresaId) {
    try {
      await atualizarEtapa(tenantId, empresaId, etapa, d.resumo, agora);
    } catch (e) {
      // O desfecho comercial nunca trava a resposta, exceto o pedido de não contatar, que precisa ser registrado.
      if (d.acao === "nao_contatar") throw e;
      console.error("[vendedor-saas] etapa não atualizada:", e instanceof Error ? e.message : e);
    }
  }
  // Conversa fora do SDR: não há acompanhamento, então o pedido de não contatar entra na lista de bloqueio pelo telefone do contato.
  if (d.acao === "nao_contatar" && !empresaId) await bloquearTelefoneDoContato(conversa);
  await enfileirar(ctx, d.texto);

  const base = { respondidoAte: ultimaDaEmpresa ?? undefined, tentativas: 0, proximaTentativaEm: null, sugestao: null, sugestaoAcao: null, sugestaoEtapa: null, sugestaoEm: null, ...(d.resumo ? { resumo: d.resumo } : {}) };
  await prisma.sdrVendedorConversa.upsert({
    where: { conversationId: conversa.id },
    create: { iniciadaEm: agora, conversationId: conversa.id, tenantId, empresaId, respondidoAte: ultimaDaEmpresa, turnos: 1, resumo: d.resumo || null },
    update: { ...base, turnos: { increment: 1 } },
  });

  if (d.acao === "sem_interesse" || d.acao === "nao_contatar") {
    await prisma.sdrVendedorConversa.update({ where: { conversationId: conversa.id }, data: { status: "ENCERRADA", motivo: d.acao === "nao_contatar" ? "pediu para não ser contatada" : "sem interesse" } });
    // Quem pediu para parar não volta para a IA nem ligando à mão por engano: o freio fica ligado nesta conversa.
    if (d.acao === "nao_contatar") await prisma.conversaAgente.upsert({ where: { conversationId: conversa.id }, create: { conversationId: conversa.id, tenantId, estado: "DESLIGADO", alteradoPorNome: AUTOR_DA_IA.name }, update: { estado: "DESLIGADO", alteradoPorNome: AUTOR_DA_IA.name } });
  } else if (d.acao === "demonstracao" || d.acao === "transferir") {
    await transferir(ctx, d.acao === "demonstracao" ? "a empresa quer a demonstração" : "assunto para uma pessoa tratar", d.resumo || null);
  }
}

async function bloquearTelefoneDoContato(conversa: Conversa) {
  const c = await prisma.conversation.findUnique({ where: { id: conversa.id }, select: { contact: { select: { phoneNumber: true } } } });
  const n = c?.contact.phoneNumber ? normalizarValorDeSupressao("TELEFONE", c.contact.phoneNumber) : null;
  if (!n || "erro" in n) return;
  try {
    await prisma.sdrSupressao.create({ data: { tenantId: conversa.tenantId, tipo: "TELEFONE", valor: n.valor, motivo: "SOLICITOU_NAO_CONTATO", observacao: "Pedido feito na conversa com o Vendedor IA", criadoPorId: AUTOR_DA_IA.id, criadoPorNome: AUTOR_DA_IA.name } });
  } catch (e) {
    // Já estava na lista: tudo certo.
    if ((e as { code?: string }).code !== "P2002") throw e;
  }
}

/** Tira a conversa da IA: vai para Pendentes, e o histórico da empresa recebe uma nota com o motivo e o resumo. */
async function transferir(ctx: Pick<Contexto, "conversa" | "empresaId" | "agora">, motivo: string, resumo: string | null) {
  const { conversa, empresaId, agora } = ctx;
  const tenantId = conversa.tenantId;
  await prisma.sdrVendedorConversa.upsert({
    where: { conversationId: conversa.id },
    create: { iniciadaEm: agora, conversationId: conversa.id, tenantId, empresaId, status: "TRANSFERIDA", motivo, resumo, transferidaEm: agora },
    update: { status: "TRANSFERIDA", motivo, ...(resumo ? { resumo } : {}), transferidaEm: agora, sugestao: null, sugestaoAcao: null, sugestaoEtapa: null, sugestaoEm: null },
  });
  // "Equipe respondeu": já está com uma pessoa, não mexe na conversa.
  if (motivo !== "equipe respondeu") await prisma.conversation.update({ where: { id: conversa.id }, data: { status: "PENDING" } });
  if (empresaId) await registrarNota(tenantId, empresaId, `Vendedor IA passou a conversa para a equipe: ${motivo}.${resumo ? ` ${resumo}` : ""}`, AUTOR_DA_IA).catch(() => undefined);
}

/* ------------------------------------------------ Modo "sugerir": a pessoa decide ---- */

async function carregarSugestao(tenantId: string, conversationId: string) {
  const estado = await prisma.sdrVendedorConversa.findFirst({ where: { conversationId, tenantId } });
  if (!estado) throw new ErroSdrCore("conversa não encontrada", 404);
  return estado;
}

export const edicaoDaSugestaoSchema = z.object({ texto: z.string().trim().min(1).max(900).optional() }).strict();

/** Envia a resposta que a IA sugeriu (ou o texto que a pessoa editou). Os efeitos no SDR são os da ação sugerida. */
export async function enviarSugestao(tenantId: string, conversationId: string, bruto: unknown, deps: DependenciasDoVendedor = {}) {
  const { texto: editado } = edicaoDaSugestaoSchema.parse(bruto ?? {});
  const estado = await carregarSugestao(tenantId, conversationId);
  if (estado.status !== "ATIVA") throw new ErroSdrCore("esta conversa já foi passada para a equipe ou encerrada", 409);
  if (!estado.sugestao) throw new ErroSdrCore("não há resposta sugerida para esta conversa", 409);
  const conversa = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { id: true, tenantId: true, sessionId: true, setorId: true } });
  if (!conversa) throw new ErroSdrCore("conversa não encontrada", 404);
  const acao = (ACOES_DO_VENDEDOR as readonly string[]).includes(estado.sugestaoAcao ?? "") ? (estado.sugestaoAcao as AcaoDoVendedor) : "continuar";
  const controle = await prisma.conversaAgente.findUnique({ where: { conversationId } });
  const campanha = await campanhaDaConversa(tenantId, estado.empresaId, controle?.campanhaId, controle?.estado === "LIGADO");
  const texto = acao === "nao_contatar" ? TEXTO_DE_DESCADASTRO : paraWhatsApp(editado ?? estado.sugestao);
  if (linksNaoPermitidos(texto, [campanha?.linkAgenda, SITE_DA_DILON]).length) throw new ErroSdrCore("o texto tem um endereço que não está no roteiro da campanha", 400);
  await executarAcao({ conversa, empresaId: estado.empresaId, agora: deps.agora?.() ?? new Date(), deps, campanhaId: controle?.campanhaId, manual: controle?.estado === "LIGADO" }, { acao, texto, resumo: estado.resumo ?? "" }, null);
  return { enviada: true as const, acao };
}

export async function descartarSugestao(tenantId: string, conversationId: string) {
  await carregarSugestao(tenantId, conversationId);
  await prisma.sdrVendedorConversa.updateMany({ where: { conversationId, tenantId }, data: { sugestao: null, sugestaoAcao: null, sugestaoEtapa: null, sugestaoEm: null } });
  return { descartada: true as const };
}

/* ------------------------------------------- Controle manual, conversa a conversa ---- */

export const controleDaConversaSchema = z
  .object({
    /** ligar: o vendedor passa a responder esta conversa; desligar: o freio; automatico: volta às regras do SDR. */
    acao: z.enum(["ligar", "desligar", "automatico"]),
    /** Roteiro a usar ao ligar numa conversa fora do SDR. Sem ele, vale o da empresa ou a campanha ativa mais recente. */
    campanhaId: z.string().trim().min(1).max(60).nullable().optional(),
  })
  .strict();

async function exigirConversaDoTenant(tenantId: string, conversationId: string) {
  const c = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { id: true, contactId: true, contact: { select: { grupo: true } } } });
  if (!c) throw new ErroSdrCore("conversa não encontrada", 404);
  if (c.contact.grupo) throw new ErroSdrCore("o vendedor não atende grupos", 409);
  return c;
}

/** A empresa do SDR a que esta conversa pertence (contato com negociação de origem "SDR"), se houver. */
async function empresaDoContato(tenantId: string, contactId: string): Promise<string | null> {
  const n = await prisma.negociacao.findFirst({ where: { tenantId, origem: "SDR", contactId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!n) return null;
  const a = await prisma.sdrAcompanhamento.findFirst({ where: { tenantId, negociacaoId: n.id }, select: { empresaId: true } });
  return a?.empresaId ?? null;
}

/** O estado do vendedor nesta conversa, para a faixa do Inbox. */
export async function obterControleDaConversa(tenantId: string, conversationId: string) {
  const c = await exigirConversaDoTenant(tenantId, conversationId);
  const [controle, estado, cfg, ia, campanhas, empresaId] = await Promise.all([
    prisma.conversaAgente.findUnique({ where: { conversationId } }),
    prisma.sdrVendedorConversa.findUnique({ where: { conversationId } }),
    obterConfigDoVendedor(tenantId),
    obterConfigIa(tenantId),
    prisma.sdrCampanha.findMany({ where: { tenantId, status: { not: "ENCERRADA" } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, nome: true } }),
    empresaDoContato(tenantId, c.contactId),
  ]);
  return {
    /** O vendedor está ligado na empresa e a IA do SDR tem o modelo da tarefa: só então dá para ligar numa conversa. */
    vendedorPronto: cfg.ativo && ia.ativa && !!ia.modelos[TAREFA_DO_VENDEDOR],
    modo: cfg.modo,
    controle: controle?.estado ?? null,
    campanhaId: controle?.campanhaId ?? null,
    alteradoPor: controle?.alteradoPorNome ?? null,
    /** A conversa é de uma empresa do SDR (o vendedor entra sozinho quando ela responde, se estiver ligado). */
    doSdr: !!empresaId,
    estado: estado ? { status: estado.status, motivo: estado.motivo, resumo: estado.resumo, turnos: estado.turnos, sugestao: estado.sugestao, sugestaoAcao: estado.sugestaoAcao } : null,
    campanhas,
  };
}

/** Respostas da IA que ainda não saíram (PENDING) são canceladas: parar tem de valer já, e não só na próxima mensagem. */
async function cancelarPendentesDaIa(conversationId: string, agora: Date) {
  const r = await prisma.message.updateMany({
    where: { conversationId, direction: "OUTBOUND", status: "PENDING", referenciaExterna: { startsWith: PREFIXO_DA_IA } },
    data: { status: "FAILED", errorMessage: "Cancelada: o vendedor foi parado nesta conversa.", statusUpdatedAt: agora },
  });
  return r.count;
}

export async function definirControleDaConversa(tenantId: string, conversationId: string, bruto: unknown, autor: Autor, agora: Date = new Date()) {
  const d = controleDaConversaSchema.parse(bruto);
  const c = await exigirConversaDoTenant(tenantId, conversationId);
  const quem = { alteradoPorId: autor.id, alteradoPorNome: autor.name };
  let canceladas = 0;

  if (d.acao === "automatico") {
    await prisma.conversaAgente.deleteMany({ where: { conversationId, tenantId } });
  } else if (d.acao === "desligar") {
    await prisma.conversaAgente.upsert({ where: { conversationId }, create: { conversationId, tenantId, estado: "DESLIGADO", ...quem }, update: { estado: "DESLIGADO", campanhaId: null, ...quem } });
    canceladas = await cancelarPendentesDaIa(conversationId, agora);
    await prisma.sdrVendedorConversa.updateMany({ where: { conversationId, tenantId }, data: { sugestao: null, sugestaoAcao: null, sugestaoEtapa: null, sugestaoEm: null } });
  } else {
    const [cfg, ia] = await Promise.all([obterConfigDoVendedor(tenantId), obterConfigIa(tenantId)]);
    if (!cfg.ativo) throw new ErroSdrCore("ligue o Vendedor IA na aba Vendedor IA do SDR antes de ligá-lo numa conversa", 409);
    if (!ia.ativa || !ia.modelos[TAREFA_DO_VENDEDOR]) throw new ErroSdrCore(`ligue a IA do SDR e escolha o modelo da tarefa ${TAREFA_DO_VENDEDOR} (aba IA)`, 409);
    if (d.campanhaId && !(await prisma.sdrCampanha.findFirst({ where: { id: d.campanhaId, tenantId }, select: { id: true } }))) throw new ErroSdrCore("campanha não encontrada", 404);
    const empresaId = await empresaDoContato(tenantId, c.contactId);
    await prisma.conversaAgente.upsert({
      where: { conversationId },
      create: { conversationId, tenantId, estado: "LIGADO", campanhaId: d.campanhaId ?? null, ...quem },
      update: { estado: "LIGADO", campanhaId: d.campanhaId ?? null, ...quem },
    });
    // Ligar recomeça a conversa para a IA: zera o limite de respostas e as falhas, e conta só as falas de pessoas dali em diante.
    const zerado = { empresaId, status: "ATIVA" as const, motivo: null, resumo: null, turnos: 0, tentativas: 0, proximaTentativaEm: null, respondidoAte: null, sugestao: null, sugestaoAcao: null, sugestaoEtapa: null, sugestaoEm: null, transferidaEm: null, iniciadaEm: agora };
    await prisma.sdrVendedorConversa.upsert({ where: { conversationId }, create: { conversationId, tenantId, ...zerado }, update: zerado });
  }
  return { ...(await obterControleDaConversa(tenantId, conversationId)), canceladas };
}
