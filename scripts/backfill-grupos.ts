/**
 * Marca como grupo os contatos de grupo gravados antes de existir Contact.grupo.
 *
 * Até 03/08/2026 o worker gravava mensagem de grupo como se o grupo fosse uma
 * pessoa, com o nome de quem mandou a primeira mensagem. Depois passou a
 * descartar grupo, então só sobraram os dessa época. Sem este script eles
 * continuariam aparecendo no Inbox e em Contatos como gente.
 *
 * Uso:
 *   npx tsx scripts/backfill-grupos.ts            (simulação, não grava)
 *   npx tsx scripts/backfill-grupos.ts --gravar
 *
 * Não ativa nenhum grupo: eles entram como disponíveis, e a equipe decide.
 * Rodar de novo é seguro: só pega quem ainda não está marcado.
 */
import { prisma } from "@dilon-zap/db";

async function main() {
  const gravar = process.argv.includes("--gravar");

  const alvos = await prisma.contact.findMany({
    where: { waJid: { endsWith: "@g.us" }, grupo: false },
    select: { id: true, waJid: true, tenant: { select: { slug: true } } },
  });

  for (const c of alvos) console.log(`${c.tenant.slug}  ${c.waJid}`);

  if (gravar && alvos.length > 0) {
    await prisma.contact.updateMany({
      where: { id: { in: alvos.map((c) => c.id) } },
      // O nome gravado é de quem mandou a primeira mensagem, não do grupo.
      // Limpo, a tela mostra "Grupo sem nome" até o WhatsApp informar o certo.
      data: { grupo: true, name: null, waName: null },
    });
  }

  console.log(`\n${gravar ? "MARCADOS" : "seriam marcados"}: ${alvos.length}`);
  if (!gravar) console.log("\nSimulação. Rode com --gravar para valer.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
