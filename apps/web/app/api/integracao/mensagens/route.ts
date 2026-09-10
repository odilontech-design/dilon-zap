import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { autenticarPorChave } from "@/lib/api-key";
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

  const { telefone, nome, mensagem, enviarEm, referencia } = parsed.data;
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) {
    return NextResponse.json({ error: "telefone inválido" }, { status: 400 });
  }

  const sessao = await prisma.whatsAppSession.findFirst({
    where: { tenantId: auth.tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
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

  if (quando && quando.getTime() > Date.now() + 60_000) {
    const agendada = await prisma.scheduledMessage.create({
      data: {
        tenantId: auth.tenantId,
        conversationId: conversa.id,
        body: mensagem,
        scheduledFor: quando,
        // Marco pra trava de "o cliente escreveu depois que isto foi
        // programado" — a mesma que o agendamento feito pela equipe usa.
        lastInboundAtOnSchedule: new Date(),
      },
      select: { id: true, scheduledFor: true },
    });

    return NextResponse.json({
      status: "agendada",
      id: agendada.id,
      enviarEm: agendada.scheduledFor,
      conversationId: conversa.id,
      referencia: referencia ?? null,
    });
  }

  const mensagemCriada = await prisma.message.create({
    data: {
      conversationId: conversa.id,
      sessionId: sessao.id,
      direction: "OUTBOUND",
      status: "PENDING",
      body: mensagem,
      // senderUserId fica nulo: não foi um atendente que escreveu, então a
      // mensagem não deve sair com o nome de ninguém na frente.
    },
    select: { id: true },
  });

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
