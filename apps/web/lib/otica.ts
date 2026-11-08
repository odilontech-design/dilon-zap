import { prisma, type Prisma } from "@dilon-zap/db";
import { wakeOutbox } from "@/lib/worker-client";
import { numeroGeral } from "@/lib/whatsapp-sessions";
import { dadosClienteSchema, paraData } from "@/lib/otica-schemas";
import type { z } from "zod";
import { SELECT_PARCELAS, encerrarConta, resumoDasParcelas } from "@/lib/otica-financeiro";
import {
  avisoDaEtapa,
  instanteNoFuso,
  montarAviso,
  numeroOS,
  primeiroNome,
  saldoCents,
  type Etapa,
} from "@/lib/otica-regras";

/**
 * O lado com banco da ótica: numeração das OS, mudança de etapa e o aviso ao
 * cliente pelo WhatsApp. As regras puras moram em lib/otica-regras.
 */

/** A configuração da ótica, criada na primeira vez que alguém precisa dela. */
export async function configDaOtica(tenantId: string) {
  return prisma.oticaConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
}

/**
 * Reserva o próximo número de OS, dentro da transação de quem cria a OS.
 *
 * O incremento é feito pelo próprio banco (`increment`), e não "ler, somar e
 * gravar": duas atendentes salvando ao mesmo tempo receberiam o mesmo número,
 * e o `@@unique([tenantId, numero])` derrubaria a segunda venda no balcão.
 */
export async function reservarNumeroOS(tx: Prisma.TransactionClient, tenantId: string): Promise<number> {
  const cfg = await tx.oticaConfig.upsert({
    where: { tenantId },
    create: { tenantId, proximoNumeroOS: 2 },
    update: { proximoNumeroOS: { increment: 1 } },
    select: { proximoNumeroOS: true },
  });
  return cfg.proximoNumeroOS - 1;
}

/** "18/11 às 16h" — como a previsão aparece para o cliente. */
export function previsaoParaCliente(d: Date | null, timezone: string): string {
  if (!d) return "";
  const dia = d.toLocaleDateString("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  return hora === "00:00" ? dia : `${dia} a partir das ${hora.replace(":00", "h")}`;
}

/**
 * Avisa o cliente pelo WhatsApp que a OS chegou a uma etapa.
 *
 * Não envia direto: cria a mensagem na fila de saída, como o recibo e a
 * mensagem agendada. Assim o aviso herda o que o envio já sabe fazer —
 * respeitar bloqueio, registrar na conversa, reenviar se falhar — e a
 * resposta do cliente cai no Inbox, na mesma conversa.
 *
 * Sai pelo número geral da loja, sem nome de atendente na frente: quem fala
 * com o cliente aqui é a ótica, não a pessoa que clicou no quadro.
 *
 * Devolve "enviado" ou o motivo de não ter avisado, que vai para o histórico.
 */
export async function avisarCliente(ordemId: string, etapa: Etapa): Promise<string> {
  const ordem = await prisma.ordemServico.findUnique({
    where: { id: ordemId },
    select: {
      tenantId: true,
      numero: true,
      previsaoEntrega: true,
      valorCents: true,
      sinalCents: true,
      // O que ainda falta vem da conta a receber (sinal, saldo, parcelas).
      conta: { select: { parcelas: { select: SELECT_PARCELAS } } },
      contact: { select: { id: true, name: true, waName: true, grupo: true } },
      tenant: { select: { name: true, timezone: true, oticaConfig: { select: { avisos: true } } } },
    },
  });
  if (!ordem) return "OS não encontrada";

  const aviso = avisoDaEtapa(etapa, ordem.tenant.oticaConfig?.avisos);
  if (!aviso) return "etapa sem aviso ao cliente";
  if (!aviso.ativo) return "aviso desligado nas configurações";
  if (ordem.contact.grupo) return "o cliente é um grupo";

  const session = await numeroGeral(ordem.tenantId);
  if (!session) return "nenhum número de WhatsApp conectado";

  const body = montarAviso(aviso.texto, {
    nome: primeiroNome(ordem.contact.name ?? ordem.contact.waName),
    os: numeroOS(ordem.numero),
    previsao: previsaoParaCliente(ordem.previsaoEntrega, ordem.tenant.timezone),
    saldoCents: ordem.conta ? resumoDasParcelas(ordem.conta.parcelas).saldoCents : saldoCents(ordem.valorCents, ordem.sinalCents),
    loja: ordem.tenant.name,
  });

  const conversa = await prisma.conversation.upsert({
    where: { contactId_sessionId: { contactId: ordem.contact.id, sessionId: session.id } },
    update: {},
    create: { tenantId: ordem.tenantId, contactId: ordem.contact.id, sessionId: session.id },
    select: { id: true, setorId: true },
  });

  await prisma.message.create({
    data: {
      conversationId: conversa.id,
      sessionId: session.id,
      direction: "OUTBOUND",
      status: "PENDING",
      body,
      setorId: conversa.setorId,
    },
  });
  await prisma.conversation.update({ where: { id: conversa.id }, data: { lastMessageAt: new Date() } });
  await wakeOutbox(ordem.tenantId);
  return "enviado";
}

/**
 * Muda a OS de etapa, registra no histórico e avisa o cliente.
 *
 * A etapa muda mesmo se o aviso falhar: o óculos está pronto na prateleira
 * independente de o WhatsApp estar conectado, e o quadro tem que dizer a
 * verdade. O motivo de não ter avisado fica no histórico, para a atendente
 * ligar.
 */
export async function moverEtapa(input: {
  tenantId: string;
  ordemId: string;
  para: Etapa;
  porId: string;
  avisar: boolean;
  motivoCancelamento?: string;
  /** Só no cancelamento: estornar o sinal. Sem isto a loja fica com o que já recebeu. */
  devolverSinal?: boolean;
}): Promise<{ aviso: string | null }> {
  const agora = new Date();
  const anterior = await prisma.ordemServico.findFirst({
    where: { id: input.ordemId, tenantId: input.tenantId },
    select: { etapa: true, contaId: true },
  });
  if (!anterior) throw new Error("OS não encontrada");

  const evento = await prisma.$transaction(async (tx) => {
    await tx.ordemServico.update({
      where: { id: input.ordemId },
      data: {
        etapa: input.para,
        etapaDesde: agora,
        // Voltar de "entregue" (clique errado) apaga a data: o óculos não saiu.
        entregueEm: input.para === "ENTREGUE" ? agora : null,
        canceladaEm: input.para === "CANCELADA" ? agora : null,
        motivoCancelamento: input.para === "CANCELADA" ? input.motivoCancelamento ?? null : null,
      },
    });
    // Cancelar a venda encerra o dinheiro na MESMA transação: ou as duas
    // coisas acontecem, ou nenhuma (um estorno que falha não deixa a OS cancelada).
    if (input.para === "CANCELADA" && anterior.contaId) {
      await encerrarConta(tx, {
        tenantId: input.tenantId,
        contaId: anterior.contaId,
        devolverSinal: input.devolverSinal === true,
        motivo: input.motivoCancelamento,
        userId: input.porId,
      });
    }
    return tx.eventoOS.create({
      data: { ordemId: input.ordemId, de: anterior.etapa, para: input.para, porId: input.porId },
      select: { id: true },
    });
  });

  if (!input.avisar) {
    await prisma.eventoOS.update({ where: { id: evento.id }, data: { aviso: "a atendente escolheu não avisar" } });
    return { aviso: null };
  }

  let aviso: string;
  try {
    aviso = await avisarCliente(input.ordemId, input.para);
  } catch (e) {
    console.error("[otica] aviso ao cliente falhou", e);
    aviso = "erro ao enfileirar a mensagem";
  }
  await prisma.eventoOS.update({ where: { id: evento.id }, data: { aviso } });
  return { aviso };
}

type DadosCliente = NonNullable<z.infer<typeof dadosClienteSchema>>;

/** A previsão digitada → o instante, no fuso da loja. undefined = não mexer. */
export function previsaoDaTela(p: { dia: string; hora: string } | null | undefined, timezone: string): Date | null | undefined {
  if (p === undefined) return undefined;
  if (p === null || !p.dia) return null;
  return instanteNoFuso(p.dia, p.hora, timezone);
}

/** O consultor tem que ser alguém da própria empresa; senão fica sem. */
export async function consultorValido(tenantId: string, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const u = await prisma.user.findFirst({ where: { id, tenantId }, select: { id: true } });
  return u?.id ?? null;
}

/** Só grava o que veio: campo ausente mantém a ficha; texto vazio limpa. */
export function dadosDoCliente(c: DadosCliente): Prisma.ContactUpdateInput {
  const out: Prisma.ContactUpdateInput = {};
  const textos = ["documento", "rgIe", "email", "cep", "logradouro", "numeroEndereco", "bairro", "cidade"] as const;
  for (const k of textos) if (c[k] !== undefined) out[k] = c[k] || null;
  if (c.nascimento !== undefined) out.nascimento = paraData(c.nascimento) ?? null;
  return out;
}
