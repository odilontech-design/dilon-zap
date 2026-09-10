/**
 * Reconstrói o histórico de atendimentos a partir do AuditLog.
 *
 * O modelo Atendimento passou a existir hoje, mas os fechamentos já estavam
 * registrados: cada `conversation.update` com status RESOLVED no AuditLog é um
 * atendimento que terminou, com data e motivo. Sem este backfill, toda conversa
 * anterior a hoje apareceria sem marcador nenhum — e a Believe, que é quem tem
 * histórico, veria a tela vazia justamente onde ela é mais útil.
 *
 * Uso:
 *   npx tsx scripts/backfill-atendimentos.ts            (simulação, não grava)
 *   npx tsx scripts/backfill-atendimentos.ts --gravar
 *
 * Rodar de novo é seguro: pula conversa que já tem ciclo gravado.
 */
import { prisma } from "@dilon-zap/db";

type Metadata = {
  conversationId?: string;
  changes?: { status?: string; closeReason?: string };
};

async function main() {
  const gravar = process.argv.includes("--gravar");

  const eventos = await prisma.auditLog.findMany({
    where: { action: "conversation.update" },
    select: { metadata: true, createdAt: true, actorUserId: true },
    orderBy: { createdAt: "asc" },
  });

  // Agrupa por conversa, na ordem em que aconteceram.
  const porConversa = new Map<string, { em: Date; motivo?: string; por: string }[]>();
  for (const e of eventos) {
    const meta = e.metadata as Metadata | null;
    if (!meta?.conversationId) continue;
    if (meta.changes?.status !== "RESOLVED") continue;

    const lista = porConversa.get(meta.conversationId) ?? [];
    lista.push({ em: e.createdAt, motivo: meta.changes?.closeReason, por: e.actorUserId });
    porConversa.set(meta.conversationId, lista);
  }

  console.log(`${eventos.length} eventos lidos, ${porConversa.size} conversas com fechamento`);

  let criados = 0;
  let puladas = 0;
  let semConversa = 0;

  for (const [conversationId, fechamentos] of porConversa) {
    const conversa = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { createdAt: true, _count: { select: { atendimentos: true } } },
    });
    if (!conversa) {
      semConversa++;
      continue;
    }
    // Já tem histórico: não duplica. É o que torna repetir o script inofensivo.
    if (conversa._count.atendimentos > 0) {
      puladas++;
      continue;
    }

    // O início de cada ciclo é o fim do anterior; o primeiro começa na criação
    // da conversa. É a mesma regra que o fechamento normal usa daqui pra
    // frente, então o histórico antigo e o novo se encaixam sem emenda.
    let inicio = conversa.createdAt;
    const linhas = fechamentos.map((f) => {
      const linha = {
        conversationId,
        iniciadoEm: inicio > f.em ? f.em : inicio,
        encerradoEm: f.em,
        motivo: f.motivo?.trim() || null,
        // encerradoById fica nulo: o AuditLog guarda o id do ator, mas se essa
        // pessoa foi excluída depois o insert falharia por chave estrangeira.
        // Nome de quem fechou é menos importante que ter o marcador.
        encerradoById: null,
      };
      inicio = f.em;
      return linha;
    });

    if (gravar) await prisma.atendimento.createMany({ data: linhas });
    criados += linhas.length;
  }

  console.log(`\n${gravar ? "GRAVADOS" : "seriam criados"}: ${criados} atendimentos`);
  console.log(`conversas puladas (já tinham histórico): ${puladas}`);
  if (semConversa > 0) console.log(`eventos de conversa que não existe mais: ${semConversa}`);
  if (!gravar) console.log("\nSimulação. Rode com --gravar para valer.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
