import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { autenticarPorChave } from "@/lib/api-key";
import { numeroGeral } from "@/lib/whatsapp-sessions";
import { recursosDoTenant } from "@/lib/plano";
import { upsertContactByPhone } from "@/lib/contact-server";
import { wakeOutbox } from "@/lib/worker-client";

/**
 * Porta para um sistema externo mandar mensagem pelo WhatsApp desta empresa.
 *
 * Existe para o Dilon Saúde: quando um agendamento é confirmado lá, a
 * confirmação e o lembrete saem por aqui, no número que o cliente já conhece.
 *
 * NÃO envia nada por conta própria. Cria a mensagem na MESMA fila de saída que
 * o Inbox usa e acorda o worker. É de propósito: a fila já sabe respeitar
 * bloqueio de contato, registrar no histórico, marcar entrega e reenviar
 * quando o aparelho do cliente não decifra. Um segundo caminho de envio seria
 * um segundo lugar pra esquecer cada uma dessas regras.
 *
 * Autenticação: `Authorization: Bearer dz_...`, uma chave por empresa.
 */

const bodySchema = z.object({
  // Telefone com DDI e DDD, só dígitos ou formatado — a normalização é feita
  // aqui. O sistema externo conhece o telefone da clínica, não o id interno
  // do contato, então é por telefone que se endereça.
  telefone: z.string().trim().min(10).max(20),
  // Nome pra usar caso o contato ainda não exista aqui. Ignorado se já existe:
  // quem já está cadastrado pode ter sido renomeado à mão pela equipe, e um
  // sistema externo não deve desfazer isso.
  nome: z.string().trim().max(120).optional(),
  mensagem: z.string().trim().min(1).max(4096),
  /**
   * Quando enviar. Ausente = agora.
   *
   * Com data futura vira ScheduledMessage, que já tem a trava de segurar o
   * envio se o cliente escrever antes da hora — é o que faz um lembrete de
   * consulta não atropelar uma conversa em andamento.
   */
  enviarEm: z.string().datetime().optional(),
  /** Id do agendamento no sistema externo, só pra rastrear nos dois lados. */
  referencia: z.string().trim().max(120).optional(),
});

/**
 * Resposta para uma referência que já foi enviada antes. O sistema externo
 * reenvia quando não recebe a resposta (queda de rede, timeout), e o cliente
 * não pode receber a confirmação duas vezes por isso: devolve o que já existe,
 * com 200 e `duplicada: true`.
 */
function respostaDeDuplicada(d: { status: string; id: string; conversationId: string; referencia: string }) {
  return NextResponse.json({ ...d, duplicada: true });
}

export async function POST(req: Request) {
  const auth = await autenticarPorChave(req);
  if (!auth) {
    return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  }

  // Chave válida não basta: a integração precisa estar no plano. Sem isto, uma
  // chave gerada enquanto a empresa estava no Escala continuaria funcionando
  // depois de um downgrade — a chave vive até ser revogada, o plano não.
  if (!(await recursosDoTenant(auth.tenantId)).has("INTEGRACAO_API")) {
    return NextResponse.json(
      { error: "integração não faz parte do plano desta empresa", foraDoPlano: true },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { telefone, nome, mensagem, enviarEm, referencia: referenciaBruta } = parsed.data;
  const referencia = referenciaBruta || undefined;
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) {
    return NextResponse.json({ error: "telefone inválido" }, { status: 400 });
  }

  // Mesma referência já enviada: não envia de novo. Só uma que FALHOU é
  // reaproveitada — o sistema externo reenvia depois de um 4xx/5xx, e travar
  // nessa referência para sempre impediria a mensagem de sair.
  if (referencia) {
    const [jaEnviada, jaAgendada] = await Promise.all([
      prisma.message.findFirst({
        where: { referenciaExterna: referencia, conversation: { tenantId: auth.tenantId } },
        select: { id: true, status: true, conversationId: true },
      }),
      prisma.scheduledMessage.findFirst({
        where: { tenantId: auth.tenantId, referenciaExterna: referencia },
        select: { id: true, status: true, conversationId: true },
      }),
    ]);
    if (jaEnviada && jaEnviada.status !== "FAILED") {
      return respostaDeDuplicada({ status: "na fila", id: jaEnviada.id, conversationId: jaEnviada.conversationId, referencia });
    }
    if (jaAgendada && jaAgendada.status !== "CANCELLED") {
      return respostaDeDuplicada({ status: "agendada", id: jaAgendada.id, conversationId: jaAgendada.conversationId, referencia });
    }
    if (jaEnviada?.status === "FAILED") {
      // Recoloca a que falhou na fila, em vez de criar outra com a mesma referência.
      await prisma.message.update({
        where: { id: jaEnviada.id },
        data: { status: "PENDING", errorMessage: null, body: mensagem },
      });
      await wakeOutbox(auth.tenantId);
      return NextResponse.json({
        status: "na fila",
        id: jaEnviada.id,
        conversationId: jaEnviada.conversationId,
        referencia,
        reenfileirada: true,
      });
    }
  }

  // Sistema de fora não sabe de setor: envia pela linha geral da empresa.
  const sessao = await numeroGeral(auth.tenantId);
  if (!sessao) {
    return NextResponse.json({ error: "nenhum número conectado nesta empresa" }, { status: 409 });
  }

  // upsertContactByPhone devolve { contact, created } — o contato vem dentro.
  const { contact: contato } = await upsertContactByPhone(auth.tenantId, digitos, nome);

  // Bloqueio é do cliente, não do sistema: quem pediu pra não receber mais não
  // passa a receber porque a mensagem veio de outra origem. A fila também
  // barraria, mas devolver 409 aqui deixa o sistema externo saber que não vai
  // sair — em vez de registrar como enviada uma mensagem que morre na fila.
  const bloqueado = await prisma.contactBlock.findFirst({
    where: { tenantId: auth.tenantId, waJid: contato.waJid },
    select: { id: true },
  });
  if (bloqueado) {
    return NextResponse.json({ error: "contato optou por não receber mensagens" }, { status: 409 });
  }

  const conversa = await prisma.conversation.upsert({
    where: { contactId_sessionId: { contactId: contato.id, sessionId: sessao.id } },
    update: {},
    create: {
      tenantId: auth.tenantId,
      sessionId: sessao.id,
      contactId: contato.id,
      // RESOLVED, e não OPEN: uma confirmação automática não é um atendimento
      // aberto esperando resposta. Se o cliente responder, a chegada da
      // mensagem reabre a conversa pelo caminho normal do worker.
      status: "RESOLVED",
    },
    select: { id: true },
  });

  const quando = enviarEm ? new Date(enviarEm) : null;

  // Dois envios da MESMA referência ao mesmo tempo passam pela conferência
  // acima juntos; o índice único decide. O perdedor não pode virar 500 — o
  // sistema externo trata 5xx como "Dilon Zap fora do ar" e para a fila toda.
  const ehReferenciaRepetida = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
  const jaCriada = async () => {
    const m = await prisma.message.findFirst({
      where: { referenciaExterna: referencia, conversation: { tenantId: auth.tenantId } },
      select: { id: true, conversationId: true },
    });
    if (m) return respostaDeDuplicada({ status: "na fila", id: m.id, conversationId: m.conversationId, referencia: referencia! });
    const a = await prisma.scheduledMessage.findFirst({
      where: { tenantId: auth.tenantId, referenciaExterna: referencia },
      select: { id: true, conversationId: true },
    });
    return a ? respostaDeDuplicada({ status: "agendada", id: a.id, conversationId: a.conversationId, referencia: referencia! }) : null;
  };

  if (quando && quando.getTime() > Date.now() + 60_000) {
    const agendada = await prisma.scheduledMessage
      .create({
      data: {
        tenantId: auth.tenantId,
        conversationId: conversa.id,
        body: mensagem,
        scheduledFor: quando,
        // Marco pra trava de "o cliente escreveu depois que isto foi
        // programado" — a mesma que o agendamento feito pela equipe usa.
        lastInboundAtOnSchedule: new Date(),
        referenciaExterna: referencia,
      },
      select: { id: true, scheduledFor: true },
    })
      .catch(async (e) => {
        if (referencia && ehReferenciaRepetida(e)) return null;
        throw e;
      });
    if (!agendada) return (await jaCriada()) ?? NextResponse.json({ error: "referência repetida" }, { status: 400 });

    return NextResponse.json({
      status: "agendada",
      id: agendada.id,
      enviarEm: agendada.scheduledFor,
      conversationId: conversa.id,
      referencia: referencia ?? null,
    });
  }

  const mensagemCriada = await prisma.message
    .create({
    data: {
      conversationId: conversa.id,
      sessionId: sessao.id,
      direction: "OUTBOUND",
      status: "PENDING",
      body: mensagem,
      referenciaExterna: referencia,
      // senderUserId fica nulo: não foi um atendente que escreveu, então a
      // mensagem não deve sair com o nome de ninguém na frente.
    },
    select: { id: true },
  })
    .catch(async (e) => {
      if (referencia && ehReferenciaRepetida(e)) return null;
      throw e;
    });
  if (!mensagemCriada) return (await jaCriada()) ?? NextResponse.json({ error: "referência repetida" }, { status: 400 });

  await wakeOutbox(auth.tenantId);

  return NextResponse.json({
    status: "na fila",
    id: mensagemCriada.id,
    conversationId: conversa.id,
    referencia: referencia ?? null,
    // O sistema externo precisa saber que "aceito" não é "entregue": se o
    // número estiver desconectado, a mensagem espera na fila.
    conexao: sessao.status,
  });
}

/**
 * GET /api/integracao/mensagens?referencia=a&referencia=b (até 100)
 *
 * Em que pé está cada mensagem enviada com essa referência — para o sistema
 * externo mostrar "entregue" ou "falhou" em vez de só "aceita na fila".
 *
 * status: "na fila" | "enviada" | "entregue" | "lida" | "falhou" | "agendada"
 *         | "segurada" (o cliente escreveu antes da hora) | "cancelada"
 * Referência desconhecida volta com status "nao_encontrada".
 */
const ROTULO_STATUS: Record<string, string> = {
  PENDING: "na fila",
  SENT: "enviada",
  DELIVERED: "entregue",
  READ: "lida",
  FAILED: "falhou",
};
const ROTULO_AGENDADA: Record<string, string> = {
  PENDING: "agendada",
  SENT: "enviada",
  HELD: "segurada",
  CANCELLED: "cancelada",
};

export async function GET(req: Request) {
  const auth = await autenticarPorChave(req);
  if (!auth) return NextResponse.json({ error: "chave inválida" }, { status: 401 });
  if (!(await recursosDoTenant(auth.tenantId)).has("INTEGRACAO_API")) {
    return NextResponse.json({ error: "integração não faz parte do plano desta empresa", foraDoPlano: true }, { status: 403 });
  }

  const referencias = [...new Set(new URL(req.url).searchParams.getAll("referencia").map((r) => r.trim()).filter(Boolean))];
  if (referencias.length === 0 || referencias.length > 100) {
    return NextResponse.json({ error: "informe de 1 a 100 referências (?referencia=...)" }, { status: 400 });
  }

  const [mensagens, agendadas] = await Promise.all([
    prisma.message.findMany({
      where: { referenciaExterna: { in: referencias }, conversation: { tenantId: auth.tenantId } },
      select: { referenciaExterna: true, status: true, errorMessage: true, statusUpdatedAt: true, createdAt: true },
    }),
    prisma.scheduledMessage.findMany({
      where: { tenantId: auth.tenantId, referenciaExterna: { in: referencias } },
      select: { referenciaExterna: true, status: true, scheduledFor: true, messageId: true },
    }),
  ]);

  // Agendada que já virou mensagem: o status é o da mensagem que ela gerou.
  const geradas = await prisma.message.findMany({
    where: { id: { in: agendadas.map((x) => x.messageId).filter((id): id is string => !!id) }, conversation: { tenantId: auth.tenantId } },
    select: { id: true, status: true, errorMessage: true, statusUpdatedAt: true, createdAt: true },
  });
  const geradaPorId = new Map(geradas.map((g) => [g.id, g]));

  const porReferencia = new Map<string, Record<string, unknown>>();
  for (const a of agendadas) {
    const gerada = a.messageId ? geradaPorId.get(a.messageId) : undefined;
    if (gerada) {
      porReferencia.set(a.referenciaExterna!, {
        referencia: a.referenciaExterna,
        status: ROTULO_STATUS[gerada.status] ?? gerada.status,
        atualizadoEm: gerada.statusUpdatedAt ?? gerada.createdAt,
        ...(gerada.status === "FAILED" ? { erro: gerada.errorMessage } : {}),
      });
      continue;
    }
    porReferencia.set(a.referenciaExterna!, { referencia: a.referenciaExterna, status: ROTULO_AGENDADA[a.status] ?? a.status, enviarEm: a.scheduledFor });
  }
  for (const m of mensagens) {
    porReferencia.set(m.referenciaExterna!, {
      referencia: m.referenciaExterna,
      status: ROTULO_STATUS[m.status] ?? m.status,
      atualizadoEm: m.statusUpdatedAt ?? m.createdAt,
      ...(m.status === "FAILED" ? { erro: m.errorMessage } : {}),
    });
  }

  return NextResponse.json({
    mensagens: referencias.map((r) => porReferencia.get(r) ?? { referencia: r, status: "nao_encontrada" }),
  });
}
