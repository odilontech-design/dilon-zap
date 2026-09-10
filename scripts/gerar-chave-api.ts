/**
 * Gera uma chave de API para um sistema externo falar com um tenant.
 *
 * Uso:
 *   npx tsx scripts/gerar-chave-api.ts <slug-do-tenant> "<nome da chave>"
 *
 * Exemplo:
 *   npx tsx scripts/gerar-chave-api.ts hemoderi "Dilon Saude - producao"
 *
 * A chave em claro aparece UMA vez, aqui na tela. O banco guarda só o hash —
 * não existe caminho pra reexibir depois, nem pra mim nem pra ninguém. Se
 * perder, revogue e gere outra.
 *
 * Rodar de dentro do container web em produção:
 *   docker compose -f docker-compose.prod.yml run --rm web \
 *     npx tsx scripts/gerar-chave-api.ts hemoderi "Dilon Saude - producao"
 */
import { prisma } from "@dilon-zap/db";
import { gerarChave } from "../apps/web/lib/api-key";

async function main() {
  const [slug, nome] = process.argv.slice(2);

  if (!slug || !nome) {
    console.error('uso: npx tsx scripts/gerar-chave-api.ts <slug> "<nome da chave>"');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    console.error(`empresa com slug "${slug}" não encontrada`);
    process.exit(1);
  }

  const { chave, hash, final } = gerarChave();

  await prisma.apiKey.create({
    data: { tenantId: tenant.id, nome, hash, final },
  });

  console.log(`\nEmpresa: ${tenant.name}`);
  console.log(`Chave:   ${nome}\n`);
  console.log(chave);
  console.log("\nGuarde agora. Esta é a única vez que ela aparece.");
  console.log("\nComo o sistema externo usa:");
  console.log("  POST https://zap.dilontech.com.br/api/integracao/mensagens");
  console.log("  Authorization: Bearer <a chave acima>");
  console.log('  { "telefone": "5521999999999", "mensagem": "..." }');
  console.log('  Opcional: "enviarEm" (ISO 8601) pra agendar, "nome", "referencia".\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
