// Teste manual da varredura de reconciliação. Monta um par duplicado
// sintético no tenant interno da Dilon Tech (sem sessão WhatsApp e sem
// clientes reais), roda a varredura e confere o resultado.
//
// Exercita de propósito o caminho difícil: o ticket MAIS ANTIGO fica do lado
// @lid, que também é o lado com a mensagem mais recente. Isso força os dois
// pontos onde a ordem das operações importa — re-apontar a conversa antes do
// delete em cascata do contato, e apagar o contato antes de reescrever o
// waJid do sobrevivente (unique [tenantId, waJid]).
//
// Rodar com: npx tsx apps/worker/src/reconcile-contacts.test-manual.ts
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const FOTO = "https://pps.whatsapp.net/v/t61.24694-24/999_teste_reconciliacao_n.jpg";

async function main() {
  const { prisma } = await import("@dilon-zap/db");
  const { reconcileDuplicateContacts } = await import("./reconcile-contacts");

  const tenant = await prisma.tenant.findFirstOrThrow({ where: { name: { contains: "Dilon Tech" } } });
  const sessao = await prisma.whatsAppSession.findFirst({ where: { tenantId: tenant.id } });
  if (!sessao) {
    console.log("tenant interno nao tem sessao; criando uma so pro teste");
  }
  const sessionId =
    sessao?.id ??
    (await prisma.whatsAppSession.create({
      data: { tenantId: tenant.id, status: "DISCONNECTED" },
    })).id;

  const limpar = async () => {
    const ids = (await prisma.contact.findMany({
      where: { tenantId: tenant.id, avatarUrl: { startsWith: FOTO } },
      select: { id: true },
    })).map((c) => c.id);
    if (ids.length) await prisma.contact.deleteMany({ where: { id: { in: ids } } });
  };
  await limpar();

  // Lado "identidade": nome e telefone, mas conversa mais NOVA e parada.
  const comTelefone = await prisma.contact.create({
    data: {
      tenantId: tenant.id, waJid: "5521999990001@s.whatsapp.net", name: "Fulana de Teste",
      phoneNumber: "5521999990001", avatarUrl: `${FOTO}?ccb=1&oh=aaa&oe=111`,
    },
  });
  // Lado @lid: sem nome, ticket mais antigo, mensagem mais recente.
  const comLid = await prisma.contact.create({
    data: { tenantId: tenant.id, waJid: "199999000112233@lid", avatarUrl: `${FOTO}?ccb=9&oh=zzz&oe=999` },
  });

  // connect em vez de FK crua: misturar escalar de relação com escrita
  // aninhada (messages.create) faz o Prisma exigir todas as relações no
  // formato de relação.
  const convLid = await prisma.conversation.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      session: { connect: { id: sessionId } },
      contact: { connect: { id: comLid.id } },
      status: "OPEN",
      tags: ["Cabeleireiro"], lastMessageAt: new Date("2026-08-10T23:00:00Z"),
      messages: {
        create: [
          { session: { connect: { id: sessionId } }, direction: "INBOUND", body: "msg antiga do lado lid", status: "DELIVERED", waMessageId: "LID-A" },
          { session: { connect: { id: sessionId } }, direction: "INBOUND", body: "msg recente do lado lid", status: "DELIVERED", waMessageId: "COMPARTILHADA" },
        ],
      },
    },
  });
  const convTel = await prisma.conversation.create({
    data: {
      tenant: { connect: { id: tenant.id } },
      session: { connect: { id: sessionId } },
      contact: { connect: { id: comTelefone.id } },
      status: "RESOLVED",
      tags: ["Já é cliente"], lastMessageAt: new Date("2026-08-10T20:00:00Z"),
      messages: {
        create: [
          { session: { connect: { id: sessionId } }, direction: "OUTBOUND", body: "resposta pelo telefone", status: "SENT", waMessageId: "TEL-A" },
          { session: { connect: { id: sessionId } }, direction: "INBOUND", body: "duplicada nos dois lados", status: "DELIVERED", waMessageId: "COMPARTILHADA" },
        ],
      },
    },
  });

  console.log(`antes:  #${convLid.ticketNumber} (@lid, 2 msgs)  |  #${convTel.ticketNumber} (telefone, 2 msgs)`);
  console.log(`        ticket mais antigo = #${Math.min(convLid.ticketNumber, convTel.ticketNumber)}`);

  await reconcileDuplicateContacts();

  const sobrou = await prisma.contact.findMany({
    where: { tenantId: tenant.id, avatarUrl: { startsWith: FOTO } },
    select: {
      id: true, name: true, waJid: true, phoneNumber: true,
      conversations: {
        select: { ticketNumber: true, tags: true, status: true, messages: { select: { waMessageId: true } } },
      },
    },
  });

  console.log("\ndepois:");
  console.log(JSON.stringify(sobrou, null, 2));

  const ok =
    sobrou.length === 1 &&
    sobrou[0].name === "Fulana de Teste" &&
    sobrou[0].phoneNumber === "5521999990001" &&
    sobrou[0].waJid === "199999000112233@lid" && // JID ativo = lado com msg mais recente
    sobrou[0].conversations.length === 1 &&
    sobrou[0].conversations[0].ticketNumber === Math.min(convLid.ticketNumber, convTel.ticketNumber) &&
    sobrou[0].conversations[0].status === "OPEN" &&
    sobrou[0].conversations[0].messages.length === 3 && // 4 menos a duplicada
    ["Cabeleireiro", "Já é cliente"].every((t) => sobrou[0].conversations[0].tags.includes(t));

  console.log(`\n${ok ? "PASSOU" : "FALHOU"}`);

  await limpar();
  if (!sessao) await prisma.whatsAppSession.delete({ where: { id: sessionId } }).catch(() => {});
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main();
