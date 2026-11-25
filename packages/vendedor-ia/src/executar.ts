import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma, type Prisma } from "@dilon-zap/db";
import { custoMicros, PRECOS } from "./custo";
import { fichaParaCliente, nomeDoVeiculo, reais } from "./ficha";
import { primeiroNomeDoCliente } from "./nome";
import { FERRAMENTAS, ROTULO_MOTIVO, montarSistema } from "./prompt";
import { agoraNaLoja, decidir, montarHistorico, paraWhatsApp, type MensagemDaConversa } from "./regras";

/**
 * O lado com banco e com a API do Vendedor IA. Roda no processo próprio
 * (apps/vendedor-ia-worker), nunca no worker do WhatsApp: uma API lenta ou
 * fora do ar aqui não atrasa a fila de nenhum outro cliente.
 *
 * Não envia nada direto ao WhatsApp. Grava a resposta como mensagem PENDING
 * na conversa, como o aviso da ótica e o recibo: o worker do WhatsApp manda,
 * respeita bloqueio e reenvio, e a conversa aparece normal no Inbox.
 */

/** O que este módulo usa da API. Nos testes entra um cliente falso que devolve respostas prontas. */
export type ClienteIa = { beta: { messages: { create: (p: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage> } } };

export type Dependencias = {
  cliente: ClienteIa;
  /** Acorda a fila de saída do worker do WhatsApp (o envio sai na hora em vez de no próximo ciclo). */
  acordarFila?: (tenantId: string) => Promise<void>;
  agora?: () => Date;
  /** Endereço do site, para o link do carro na vitrine. */
  urlDoSite?: string | null;
};

/** Modelos com recusa redirecionada pelo servidor (`fallbacks: "default"`). O Haiku 5.5 não tem. */
const COM_FALLBACK = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1"]);
const MAX_IDAS_E_VOLTAS = 5;
const MENSAGENS_NO_HISTORICO = 40;

/* --------------------------------------------------------------- busca */

/** Lojas com o Vendedor IA ligado e o recurso liberado. */
export async function lojasAtivas() {
  const liberadas = await prisma.tenantRecurso.findMany({ where: { recurso: "VENDEDOR_IA", ativo: true }, select: { tenantId: true } });
  if (!liberadas.length) return [];
  return prisma.vendedorIaConfig.findMany({
    where: { tenantId: { in: liberadas.map((l) => l.tenantId) }, ativo: true, ativadoEm: { not: null } },
    include: { tenant: { select: { name: true, slug: true, timezone: true, veiculosConfig: { select: { nomeLoja: true, vitrineAtiva: true, dominio: true, ocultarPrecoNoSite: true, ocultarKmNoSite: true } } } } },
  });
}

export type Loja = Awaited<ReturnType<typeof lojasAtivas>>[number];

/** Leads (conversas assumidas) e custo da loja no mês corrente. */
export async function usoDoMes(tenantId: string, agora: Date) {
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const [leads, custo] = await Promise.all([
    prisma.vendedorIaConversa.count({ where: { tenantId, iniciadaEm: { gte: inicio } } }),
    prisma.vendedorIaUso.aggregate({ where: { tenantId, createdAt: { gte: inicio } }, _sum: { custoMicrosUsd: true } }),
  ]);
  return { leads, custoMicrosUsd: custo._sum.custoMicrosUsd ?? 0 };
}

/**
 * Uma volta do ciclo: para cada loja ligada, as conversas do número geral com
 * mensagem do cliente nos últimos 15 minutos. Devolve quantas respondeu.
 */
export async function ciclo(deps: Dependencias): Promise<{ respondidas: number; erros: number }> {
  const agora = deps.agora?.() ?? new Date();
  let respondidas = 0;
  let erros = 0;
  for (const loja of await lojasAtivas()) {
    const desde = new Date(Math.max(loja.ativadoEm!.getTime(), agora.getTime() - 15 * 60_000));
    const conversas = await prisma.conversation.findMany({
      where: {
        tenantId: loja.tenantId,
        lastMessageAt: { gt: desde },
        // Número geral: o de setor é de outra equipe (financeiro, pós-venda).
        session: { setorId: null },
        contact: { grupo: false },
      },
      select: { id: true },
      take: 50,
    });
    for (const c of conversas) {
      try {
        if (await atenderConversa(c.id, loja, deps)) respondidas++;
      } catch (e) {
        erros++;
        console.error(`[vendedor-ia] conversa ${c.id}:`, e instanceof Error ? e.message : e);
      }
    }
  }
  return { respondidas, erros };
}

/* --------------------------------------------------------------- conversa */

/** Atende uma conversa se for a vez da IA. Devolve true se respondeu. */
export async function atenderConversa(conversationId: string, loja: Loja, deps: Dependencias): Promise<boolean> {
  const agora = deps.agora?.() ?? new Date();
  const conversa = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, tenantId: true, sessionId: true, setorId: true, assignedToId: true, contact: { select: { name: true } } },
  });
  if (!conversa || conversa.tenantId !== loja.tenantId) return false;

  // O freio do Inbox ("Assumir"): a IA não responde mais nesta conversa até alguém devolver.
  const controle = await prisma.conversaAgente.findUnique({ where: { conversationId }, select: { estado: true, tenantId: true } });
  if (controle?.estado === "DESLIGADO" && controle.tenantId === loja.tenantId) return false;

  const recentes = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: MENSAGENS_NO_HISTORICO,
    select: { direction: true, body: true, mediaType: true, createdAt: true, senderUserId: true, deCelular: true, isDeleted: true },
  });
  const mensagens = recentes.reverse() as MensagemDaConversa[];
  const estado = await prisma.vendedorIaConversa.findUnique({ where: { conversationId } });

  let limiteAtingido = false;
  if (!estado) {
    const uso = await usoDoMes(loja.tenantId, agora);
    // O limite da loja nunca passa do contratado.
    const limiteLeads = loja.leadsContratados === null ? loja.limiteLeadsMes : Math.min(loja.limiteLeadsMes, loja.leadsContratados);
    limiteAtingido = uso.leads >= limiteLeads || (loja.limiteCustoMesCents != null && uso.custoMicrosUsd >= loja.limiteCustoMesCents * 10_000);
  }

  const decisao = decidir(
    {
      conversa: estado ? { status: estado.status, respondidoAte: estado.respondidoAte, turnos: estado.turnos, iniciadaEm: estado.iniciadaEm } : null,
      mensagens,
      ativadoEm: loja.ativadoEm!,
      atribuida: conversa.assignedToId !== null,
      limiteAtingido,
    },
    agora
  );
  if (decisao.acao === "transferir") {
    await transferir(conversa, loja, decisao.motivo, estado?.resumo ?? null, agora);
    return false;
  }
  if (decisao.acao !== "responder") return false;

  const historico = montarHistorico(mensagens);
  if (!historico) return false;
  const ultimaDoCliente = mensagens[mensagens.length - 1].createdAt;

  // Marca antes de chamar a API: se a chamada falhar, esta mensagem não é
  // tentada de novo a cada 3 segundos (cada tentativa custa). A próxima
  // mensagem do cliente tenta outra vez.
  await prisma.vendedorIaConversa.upsert({
    where: { conversationId },
    create: { conversationId, tenantId: loja.tenantId, respondidoAte: ultimaDoCliente, iniciadaEm: agora },
    update: { respondidoAte: ultimaDoCliente },
  });

  try {
    await responder({ conversa, loja, historico, deps, agora });
  } catch (e) {
    // A API falhou depois das tentativas do próprio SDK (2 retentativas com espera). O cliente não pode ficar sem
    // resposta nem sem ninguém sabendo: passa para um vendedor, com o aviso ao cliente.
    console.error(`[vendedor-ia] conversa ${conversationId}: a API falhou, passando para um vendedor:`, e instanceof Error ? e.message : e);
    await passarPorFalha(conversa, loja, deps, agora);
    return false;
  }
  await prisma.vendedorIaConversa.update({ where: { conversationId }, data: { turnos: { increment: 1 } } });
  return true;
}

export const MOTIVO_DA_FALHA = "a IA ficou indisponível";

/** A IA não conseguiu responder: a conversa vai para a equipe (Pendentes) e o cliente é avisado. Nunca lança. */
async function passarPorFalha(conversa: Conversa, loja: Loja, deps: Dependencias, agora: Date) {
  try {
    await transferir(conversa, loja, MOTIVO_DA_FALHA, null, agora);
    await enfileirar(conversa, [{ body: "Vou passar você para um dos nossos vendedores, que continua o atendimento por aqui. Só um instante!" }]);
    await deps.acordarFila?.(conversa.tenantId);
  } catch (e) {
    console.error(`[vendedor-ia] conversa ${conversa.id}: nem a passagem para a equipe funcionou:`, e instanceof Error ? e.message : e);
  }
}

export type Conversa = { id: string; tenantId: string; sessionId: string; setorId: string | null; contact?: { name?: string | null } | null };

/** Uma rodada de resposta: chama a API, executa as ferramentas pedidas e manda o texto final. */
async function responder(input: { conversa: Conversa; loja: Loja; historico: Anthropic.Beta.BetaMessageParam[]; deps: Dependencias; agora: Date }) {
  const { conversa, loja, deps, agora } = input;
  const nomeLoja = loja.tenant.veiculosConfig?.nomeLoja?.trim() || loja.tenant.name;
  const sistema = montarSistema({ nomeLoja, nomeAssistente: loja.nomeAssistente, instrucoes: loja.instrucoes });

  // A data e hora vão no fim, numa mensagem de sistema: no prompt fixo,
  // mudariam o prefixo a cada minuto e nada ficaria em cache.
  // O nome do cliente também vai no fim (muda a cada conversa, então não pode estar no prompt fixo).
  const nomeCliente = primeiroNomeDoCliente(conversa.contact?.name);
  const aviso = `Agora na loja: ${agoraNaLoja(agora, loja.tenant.timezone)}.${nomeCliente ? ` Cliente: ${nomeCliente}.` : ""}`;
  const mensagens: Anthropic.Beta.BetaMessageParam[] = [...input.historico, { role: "system", content: aviso }];

  let transferiu = false;
  let textoFinal = "";
  for (let i = 0; i < MAX_IDAS_E_VOLTAS; i++) {
    const resposta = await deps.cliente.beta.messages.create({
      model: loja.modelo,
      max_tokens: 8_000,
      system: [{ type: "text", text: sistema }],
      tools: FERRAMENTAS,
      messages: mensagens,
      // Cache automático: o prefixo (instruções, ferramentas e conversa) fica
      // guardado para a próxima ida e volta e para a próxima mensagem do cliente.
      cache_control: { type: "ephemeral" },
      output_config: { effort: loja.esforco as "low" | "medium" | "high" },
      ...(COM_FALLBACK.has(loja.modelo) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    await registrarUso(conversa, resposta, loja.modelo);

    if (resposta.stop_reason === "refusal") {
      await transferir(conversa, loja, "a IA não pôde responder", null, agora);
      transferiu = true;
      break;
    }

    const textos = resposta.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text);
    if (textos.length) textoFinal = textos.join("\n");
    const pedidos = resposta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (resposta.stop_reason !== "tool_use" || !pedidos.length) break;

    // A resposta inteira volta para o histórico (raciocínio e pedidos de
    // ferramenta incluídos, sem mexer), seguida de TODOS os resultados numa
    // mensagem só.
    mensagens.push({ role: "assistant", content: resposta.content as Anthropic.Beta.BetaContentBlockParam[] });
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const p of pedidos) {
      const r = await executarFerramenta(p, { conversa, loja, deps, agora });
      if (r.transferiu) transferiu = true;
      resultados.push({ type: "tool_result", tool_use_id: p.id, content: r.texto, ...(r.erro ? { is_error: true } : {}) });
    }
    mensagens.push({ role: "user", content: resultados });
    // Texto que veio junto do pedido de ferramenta ("vou ver aqui") já foi
    // aproveitado; a resposta de verdade vem na próxima volta.
    textoFinal = "";
  }

  const texto = paraWhatsApp(textoFinal) || (transferiu ? "Vou passar você para um dos nossos vendedores, que continua o atendimento por aqui. Só um instante!" : "");
  if (texto) await enfileirar(conversa, [{ body: texto }]);
  await deps.acordarFila?.(conversa.tenantId);
}

async function registrarUso(conversa: Conversa, r: Anthropic.Beta.BetaMessage, modeloPedido: string) {
  // Com fallback, quem respondeu pode ser outro modelo: cobra pelo que respondeu.
  const modelo = PRECOS[r.model] ? r.model : modeloPedido;
  const u = r.usage;
  await prisma.vendedorIaUso.create({
    data: {
      tenantId: conversa.tenantId,
      conversationId: conversa.id,
      modelo,
      inputTokens: u.input_tokens,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      outputTokens: u.output_tokens,
      custoMicrosUsd: PRECOS[modelo] ? custoMicros(u, modelo) : 0,
    },
  });
}

/* --------------------------------------------------------------- ferramentas */

type Contexto = { conversa: Conversa; loja: Loja; deps: Dependencias; agora: Date };
type Resultado = { texto: string; erro?: boolean; transferiu?: boolean };

export async function executarFerramenta(p: { name: string; input: unknown }, ctx: Contexto): Promise<Resultado> {
  // O modo estrito garante o formato, mas a entrada continua vindo de fora:
  // confere o que importa antes de usar.
  const e = (p.input ?? {}) as Record<string, unknown>;
  try {
    if (p.name === "buscar_estoque") return await buscarEstoque(e, ctx);
    if (p.name === "enviar_carro") return await enviarCarro(e, ctx);
    if (p.name === "transferir_para_vendedor") {
      const motivo = typeof e.motivo === "string" ? e.motivo : "outro";
      const resumo = typeof e.resumo === "string" ? e.resumo.slice(0, 1000) : null;
      await transferir(ctx.conversa, ctx.loja, ROTULO_MOTIVO[motivo] ?? motivo, resumo, ctx.agora);
      return { texto: "Conversa transferida. Avise o cliente em uma frase que um vendedor vai continuar o atendimento por aqui.", transferiu: true };
    }
    return { texto: `ferramenta desconhecida: ${p.name}`, erro: true };
  } catch (err) {
    console.error(`[vendedor-ia] ferramenta ${p.name}:`, err instanceof Error ? err.message : err);
    return { texto: "Não foi possível usar a ferramenta agora. Siga sem ela ou transfira para um vendedor.", erro: true };
  }
}

async function buscarEstoque(e: Record<string, unknown>, ctx: Contexto): Promise<Resultado> {
  const where: Prisma.VeiculoWhereInput = { tenantId: ctx.loja.tenantId, status: { in: ["DISPONIVEL", "RESERVADO"] } };
  const filtros: Prisma.VeiculoWhereInput[] = [];
  if (typeof e.texto === "string" && e.texto.trim()) {
    for (const palavra of e.texto.trim().split(/\s+/).slice(0, 4)) {
      filtros.push({ OR: [{ modelo: { contains: palavra, mode: "insensitive" } }, { versao: { contains: palavra, mode: "insensitive" } }, { marca: { contains: palavra, mode: "insensitive" } }] });
    }
  }
  if (typeof e.marca === "string" && e.marca.trim()) filtros.push({ marca: { contains: e.marca.trim(), mode: "insensitive" } });
  // Carro "sob consulta" não entra no filtro de preço (listar só os que cabem em X revelaria o valor).
  const lojaSemPreco = ctx.loja.tenant.veiculosConfig?.ocultarPrecoNoSite === true;
  const lojaSemKm = ctx.loja.tenant.veiculosConfig?.ocultarKmNoSite === true;
  if (typeof e.preco_max_reais === "number" && e.preco_max_reais > 0 && !lojaSemPreco) filtros.push({ OR: [{ ocultarPreco: true }, { precoCents: { lte: Math.round(e.preco_max_reais * 100) } }] });
  if (typeof e.ano_min === "number") filtros.push({ anoModelo: { gte: e.ano_min } });
  const carroceria = typeof e.carroceria === "string" && e.carroceria.trim() ? e.carroceria.trim() : null;
  if (carroceria) filtros.push({ carroceria: { equals: carroceria, mode: "insensitive" } });
  if (e.cambio === "manual") filtros.push({ cambio: { contains: "manual", mode: "insensitive" } });
  if (e.cambio === "automatico") filtros.push({ NOT: { cambio: { contains: "manual", mode: "insensitive" } }, cambio: { not: null } });
  if (filtros.length) where.AND = filtros;
  const limite = typeof e.limite === "number" ? Math.min(Math.max(Math.round(e.limite), 1), 10) : 6;

  const carros = await prisma.veiculo.findMany({
    where,
    orderBy: [{ status: "asc" }, { precoCents: "asc" }],
    take: limite,
    // Só o que pode ir para o cliente: nada de custo, piso, placa ou observação interna.
    select: {
      id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, km: true, kmInformado: true, ocultarKm: true, ocultarPreco: true,
      precoCents: true, cambio: true, combustivel: true, cor: true, carroceria: true, opcionais: true, status: true, _count: { select: { fotos: true } },
    },
  });
  if (!carros.length) {
    return {
      texto: carroceria
        ? `Nenhum carro com carroceria ${carroceria} cadastrada no estoque com esses filtros. O cadastro pode estar sem essa informação em alguns carros: busque de novo sem o filtro de carroceria e escolha pelo modelo, ou diga ao cliente que no momento não tem e ofereça avisar quando chegar.`
        : "Nenhum carro no estoque com esses filtros. Tente uma busca mais ampla ou diga ao cliente que no momento não tem e ofereça avisar quando chegar.",
    };
  }
  const linhas = carros.map(
    (c) =>
      `- id ${c.id}: ${nomeDoVeiculo(c)}, ${lojaSemKm || c.ocultarKm ? "km não divulgada" : c.kmInformado ? `${c.km.toLocaleString("pt-BR")} km` : "km não informada"}, ` +
      `${lojaSemPreco || c.ocultarPreco ? "valor não divulgado (não cite valor nem km a menos que o cliente pergunte; se perguntar, não informe nem estime: o vendedor passa)" : reais(c.precoCents)}` +
      `${c.carroceria ? `, ${c.carroceria}` : ""}${c.cambio ? `, ${c.cambio}` : ""}${c.combustivel ? `, ${c.combustivel}` : ""}${c.cor ? `, ${c.cor}` : ""}` +
      `${c.opcionais.length ? `; opcionais: ${c.opcionais.slice(0, 8).join(", ")}` : ""}; ${c._count.fotos} foto(s)` +
      `${c.status === "RESERVADO" ? "; RESERVADO para outro cliente" : ""}`
  );
  return { texto: linhas.join("\n") };
}

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function enviarCarro(e: Record<string, unknown>, ctx: Contexto): Promise<Resultado> {
  const id = typeof e.veiculo_id === "string" ? e.veiculo_id : "";
  const qtd = typeof e.fotos === "number" ? Math.min(Math.max(Math.round(e.fotos), 0), 8) : 4;
  const v = await prisma.veiculo.findFirst({
    where: { id, tenantId: ctx.loja.tenantId, status: { in: ["DISPONIVEL", "RESERVADO"] } },
    include: { fotos: { orderBy: { ordem: "asc" }, take: Math.max(qtd, 1) } },
  });
  if (!v) return { texto: "Carro não encontrado ou não está mais à venda. Busque de novo no estoque.", erro: true };

  // Domínio próprio da loja, se tiver; senão o endereço do Zap.
  const dominio = ctx.loja.tenant.veiculosConfig?.dominio;
  const site = dominio ? `https://${dominio}` : ctx.deps.urlDoSite?.replace(/\/+$/, "");
  const link = site && ctx.loja.tenant.veiculosConfig?.vitrineAtiva && v.naVitrine ? `${site}/loja/${ctx.loja.tenant.slug}/${v.id}` : null;
  const ficha = fichaParaCliente({ ...v, precoOculto: ctx.loja.tenant.veiculosConfig?.ocultarPrecoNoSite === true || v.ocultarPreco, kmOculto: ctx.loja.tenant.veiculosConfig?.ocultarKmNoSite === true || v.ocultarKm }, { enxuta: true }) + (link ? `\n\n${link}` : "");
  const fotos = qtd > 0 ? v.fotos.slice(0, qtd) : [];
  await enfileirar(
    ctx.conversa,
    fotos.length
      ? fotos.map((f, i) => {
          const ext = f.key.slice(f.key.lastIndexOf(".") + 1).toLowerCase();
          return { body: i === 0 ? ficha : "", mediaKey: f.key, mediaMimeType: MIME[ext] ?? "image/jpeg", mediaFileName: `${v.marca}-${v.modelo}-${i + 1}.${ext}` };
        })
      : [{ body: ficha }]
  );
  await prisma.eventoVeiculo.create({ data: { veiculoId: v.id, tipo: "envio", descricao: `Enviado pelo Vendedor IA (${fotos.length} foto${fotos.length === 1 ? "" : "s"})` } });
  return { texto: `Ficha${fotos.length ? ` e ${fotos.length} foto(s)` : ""} do ${nomeDoVeiculo(v)} enviadas ao cliente.` };
}

/* --------------------------------------------------------------- saída */

/**
 * Grava mensagens na fila de saída, na ordem. Sem `senderUserId` e sem
 * `deCelular`, como o robô: o Inbox mostra como automática e as regras do
 * worker não confundem com uma pessoa da equipe. A `referenciaExterna`
 * identifica as mensagens da IA nos relatórios.
 */
export async function enfileirar(conversa: Conversa, msgs: { body: string; mediaKey?: string; mediaMimeType?: string; mediaFileName?: string }[]) {
  const base = Date.now();
  await prisma.message.createMany({
    data: msgs.map((m, i) => ({
      conversationId: conversa.id,
      sessionId: conversa.sessionId,
      direction: "OUTBOUND" as const,
      status: "PENDING" as const,
      body: m.body,
      setorId: conversa.setorId,
      referenciaExterna: `vendedor-ia:${randomUUID()}`,
      // createdAt crescente: o worker manda na ordem de criação.
      createdAt: new Date(base + i),
      ...(m.mediaKey ? { mediaType: "IMAGE" as const, mediaKey: m.mediaKey, mediaMimeType: m.mediaMimeType, mediaFileName: m.mediaFileName } : {}),
    })),
  });
  await prisma.conversation.update({ where: { id: conversa.id }, data: { lastMessageAt: new Date() } });
}

/** Tira a conversa da IA: vai para Pendentes (e para o setor escolhido), com o resumo para o vendedor. */
async function transferir(conversa: Conversa, loja: Loja, motivo: string, resumo: string | null, agora: Date) {
  await prisma.vendedorIaConversa.upsert({
    where: { conversationId: conversa.id },
    create: { conversationId: conversa.id, tenantId: loja.tenantId, status: "TRANSFERIDA", motivo, resumo, transferidaEm: agora },
    update: { status: "TRANSFERIDA", motivo, ...(resumo ? { resumo } : {}), transferidaEm: agora },
  });
  // "Equipe respondeu" já está com uma pessoa: não mexe na conversa.
  if (motivo === "equipe respondeu") return;
  await prisma.conversation.update({
    where: { id: conversa.id },
    data: { status: "PENDING", ...(loja.setorTransferenciaId ? { setorId: loja.setorTransferenciaId } : {}) },
  });
}
