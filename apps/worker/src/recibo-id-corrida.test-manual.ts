// Trava de regressão do id da mensagem na fila de saída.
//
// O BUG: dois ciclos de polling da mesma sessão liam a mesma mensagem
// PENDING. O primeiro gerava o id, gravava e mandava pro WhatsApp; o segundo
// — que tinha lido a linha ANTES, com waMessageId ainda nulo — gerava OUTRO
// id e sobrescrevia o do primeiro. A mensagem chegava no cliente, mas o
// recibo de entrega vinha com o id que saiu de verdade e não encontrava mais
// a linha. Resultado na tela: "sem confirmação" pra sempre, numa mensagem
// entregue.
//
// Dois ciclos na mesma sessão deixaram de ser hipótese quando se viu que
// entry.stop() não era chamado por ninguém: cada reconexão do WhatsApp
// deixava o pollOutbox anterior rodando pra sempre.
//
// Rodar (precisa de um Postgres com o schema aplicado):
//   DATABASE_URL=... npx tsx apps/worker/src/recibo-id-corrida.test-manual.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let sequencia = 0;
const generateMessageID = () => `ID-${++sequencia}`;

let falhas = 0;
function conferir(descricao: string, condicao: boolean, detalhe = "") {
  if (!condicao) falhas++;
  console.log(`${condicao ? "ok   " : "FALHA"}  ${descricao}${condicao || !detalhe ? "" : `\n         ${detalhe}`}`);
}

/**
 * O trecho do pollOutbox que importa aqui, com a correção: grava o id só se
 * ninguém gravou antes, e adota o id alheio quando perde a corrida.
 */
async function reservarIdDoEnvio(message: { id: string; waMessageId: string | null }) {
  if (message.waMessageId) return message.waMessageId;

  const novoId = generateMessageID();
  const { count } = await prisma.message.updateMany({
    where: { id: message.id, waMessageId: null },
    data: { waMessageId: novoId },
  });
  if (count === 1) return novoId;

  const atual = await prisma.message.findUnique({ where: { id: message.id }, select: { waMessageId: true } });
  return atual?.waMessageId ?? novoId;
}

/** aplicarRecibo do session-manager, reduzido ao que este teste exercita. */
async function aplicarRecibo(sessionId: string, waMessageId: string) {
  const { count } = await prisma.message.updateMany({
    where: { sessionId, waMessageId, direction: "OUTBOUND", status: { in: ["PENDING", "FAILED", "SENT"] } },
    data: { status: "DELIVERED", statusUpdatedAt: new Date() },
  });
  return count;
}

async function main() {
  const marca = `corrida-${Date.now()}`;
  const tenant = await prisma.tenant.create({ data: { name: marca, slug: marca } });
  const sessao = await prisma.whatsAppSession.create({ data: { tenantId: tenant.id, status: "CONNECTED" } });
  const contato = await prisma.contact.create({ data: { tenantId: tenant.id, waJid: `${marca}@s.whatsapp.net` } });
  const conversa = await prisma.conversation.create({
    data: { tenantId: tenant.id, sessionId: sessao.id, contactId: contato.id },
  });

  const criada = await prisma.message.create({
    data: { conversationId: conversa.id, sessionId: sessao.id, direction: "OUTBOUND", status: "PENDING", body: "Bom dia, tudo bem ?" },
  });

  // Os dois ciclos leem a linha com waMessageId nulo — é a janela que o
  // findMany sem claim deixa aberta.
  const leituraDoCicloVivo = { id: criada.id, waMessageId: criada.waMessageId };
  const leituraDoCicloOrfao = { id: criada.id, waMessageId: criada.waMessageId };

  const idQueSaiuNoWhatsApp = await reservarIdDoEnvio(leituraDoCicloVivo);
  await prisma.message.updateMany({
    where: { id: criada.id, status: "PENDING" },
    data: { status: "SENT", statusUpdatedAt: new Date() },
  });

  // O órfão só chega aqui depois, com o socket já morto: ele nem envia, mas
  // antes do conserto já tinha estragado a linha.
  const idDoCicloOrfao = await reservarIdDoEnvio(leituraDoCicloOrfao);

  conferir("ciclo atrasado adota o id de quem enviou, em vez de gerar outro", idDoCicloOrfao === idQueSaiuNoWhatsApp,
    `enviou com ${idQueSaiuNoWhatsApp}, o atrasado usou ${idDoCicloOrfao}`);

  const gravada = await prisma.message.findUniqueOrThrow({ where: { id: criada.id } });
  conferir("o banco guarda o id que realmente saiu no WhatsApp", gravada.waMessageId === idQueSaiuNoWhatsApp,
    `no banco ${gravada.waMessageId}, saiu ${idQueSaiuNoWhatsApp}`);

  const linhas = await aplicarRecibo(sessao.id, idQueSaiuNoWhatsApp);
  conferir("o recibo de entrega encontra a mensagem", linhas === 1, `atualizou ${linhas} linha(s)`);

  const final = await prisma.message.findUniqueOrThrow({ where: { id: criada.id } });
  conferir('mensagem entregue nao fica em "sem confirmacao"', final.status === "DELIVERED", `status ficou ${final.status}`);

  // Retentativa do mesmo ciclo continua reaproveitando o id — a propriedade
  // que impede o cliente de receber a mesma mensagem duas vezes.
  const naRetentativa = await reservarIdDoEnvio({ id: criada.id, waMessageId: final.waMessageId });
  conferir("retentativa reaproveita o id ja gravado", naRetentativa === idQueSaiuNoWhatsApp,
    `esperado ${idQueSaiuNoWhatsApp}, obtido ${naRetentativa}`);

  await prisma.tenant.delete({ where: { id: tenant.id } });

  console.log(falhas === 0 ? "\ntodos os casos passaram" : `\n${falhas} caso(s) falharam`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
