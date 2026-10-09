import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import {
  aplicarEtapaEValorDoContato,
  camposDoContato,
  ErroDeNegocio,
  NEGOCIACAO_ABERTA_DO_CONTATO,
} from "@/lib/negociacoes";

const bodySchema = z.object({
  stageId: z.string().nullable().optional(),
  dealValueCents: z.number().int().min(0).optional(),
  name: z.string().max(120).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  documento: z.string().max(40).nullable().optional(),
  endereco: z.string().max(300).nullable().optional(),
});

/**
 * Ficha completa do cliente: os dados dele + o histórico de atendimentos.
 *
 * Rota própria, separada da listagem, de propósito. A listagem alimenta o
 * funil e a tabela de Contatos e precisa ser leve porque carrega a base
 * inteira; a ficha carrega uma pessoa só e pode ser generosa. Enfiar o
 * histórico na listagem inflaria um payload que já foi enxugado uma vez.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: {
      id: true,
      name: true,
      waJid: true,
      phoneNumber: true,
      avatarUrl: true,
      lastStatusAt: true,
      notes: true,
      notesUpdatedAt: true,
      documento: true,
      endereco: true,
      hasWhatsapp: true,
      createdAt: true,
      negociacoes: NEGOCIACAO_ABERTA_DO_CONTATO,
      conversations: {
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          tags: true,
          closeReason: true,
          closedAt: true,
          createdAt: true,
          lastMessageAt: true,
          assignedTo: { select: { name: true } },
          // Uma prévia só: a ficha mostra do que foi a conversa, e quem
          // quiser ler tudo abre o atendimento.
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, direction: true, mediaType: true },
          },
          _count: { select: { messages: true } },
        },
      },
    },
  });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { negociacoes, ...resto } = contact;
  return NextResponse.json({ ...resto, ...camposDoContato(negociacoes) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { notes, documento, endereco, stageId, dealValueCents, ...resto } = parsed.data;

  // Etapa e valor são da negociação, não do contato (ver lib/negociacoes). A
  // etapa é conferida contra o tenant lá dentro — senão dava pra mover contato
  // da Believe pra uma etapa cadastrada por outro negócio.
  try {
    if (stageId !== undefined || dealValueCents !== undefined) {
      await aplicarEtapaEValorDoContato({ tenantId: user.tenantId, quem: user, contato: contact, stageId, dealValueCents });
    }
  } catch (e) {
    if (e instanceof ErroDeNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  // Mesma regra da anotação: campo apagado vira null, não string vazia, pra
  // o recibo só ter um caso a checar na hora de omitir a linha.
  const limpo = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: {
      ...resto,
      // Nome digitado aqui vira definitivo: a partir de agora nenhuma
      // sincronização do WhatsApp reescreve. Era exatamente esse o problema
      // relatado — a atendente corrigia o nome e ele voltava sozinho pro
      // nome que a cliente usa na conta dela.
      ...(resto.name !== undefined ? { nameManual: true } : {}),
      // Anotação em branco volta pra null, e não string vazia: "sem
      // anotação" e "anotação apagada" são a mesma coisa pra quem lê, e a
      // UI só precisa checar um caso.
      ...(notes !== undefined
        ? { notes: notes?.trim() ? notes.trim() : null, notesUpdatedAt: new Date() }
        : {}),
      documento: limpo(documento),
      endereco: limpo(endereco),
    },
  });

  const abertas = await prisma.negociacao.findMany({
    where: { contactId: contact.id, ...NEGOCIACAO_ABERTA_DO_CONTATO.where },
    orderBy: NEGOCIACAO_ABERTA_DO_CONTATO.orderBy,
    take: 1,
    select: NEGOCIACAO_ABERTA_DO_CONTATO.select,
  });
  return NextResponse.json({ ...updated, ...camposDoContato(abertas) });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Apagar o contato levaria junto as negociações dele — inclusive as ganhas,
  // que são a receita nos indicadores. Melhor barrar e dizer o que fazer.
  const negociacoes = await prisma.negociacao.count({ where: { contactId: contact.id } });
  if (negociacoes > 0) {
    return NextResponse.json(
      { error: `Este contato tem ${negociacoes} negociação(ões) no funil. Apague-as no Funil antes, se quiser mesmo remover o contato.` },
      { status: 409 }
    );
  }

  // onDelete: Cascade no schema cuida de apagar junto as conversas e mensagens desse contato.
  await prisma.contact.delete({ where: { id: contact.id } });

  await logAudit({ actor: user, action: "contact.delete", metadata: { waJid: contact.waJid, name: contact.name } });

  return NextResponse.json({ ok: true });
}
