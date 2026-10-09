/**
 * Passa o funil antigo (etapa e valor dentro do CONTATO) para o modelo novo
 * (funil + negociação).
 *
 * Por empresa:
 *  1. cria o "Funil de vendas" padrão, se não existir;
 *  2. adota as etapas que ainda não pertencem a funil nenhum;
 *  3. cada contato que estava numa etapa vira UMA negociação aberta nessa etapa,
 *     com o valor que tinha e o evento "criada" no histórico;
 *  4. cria a lista inicial de motivos de perda, se a empresa não tem nenhum.
 *
 * A data de criação das negociações é a da migração, de propósito: não existe
 * registro de QUANDO o contato entrou na etapa, e inventar uma data velha
 * faria a coorte do período parecer maior do que foi.
 *
 * Contato e etapa antigos NÃO são tocados: se algo der errado, o funil antigo
 * continua lá.
 *
 * Uso:
 *   npx tsx scripts/migrar-funil-negociacoes.ts            (simulação, não grava)
 *   npx tsx scripts/migrar-funil-negociacoes.ts --gravar
 *
 * Rodar de novo é seguro: contato que já tem negociação é pulado. Rodar SÓ no
 * container da VPS depois do `db push` — o banco local é o de produção.
 */
import { prisma } from "@dilon-zap/db";

const MOTIVOS = ["Preço", "Sem resposta", "Escolheu um concorrente", "Sem orçamento", "Não era o momento", "Fora do perfil"];

async function main() {
  const gravar = process.argv.includes("--gravar");
  console.log(gravar ? "GRAVANDO" : "SIMULAÇÃO (use --gravar para aplicar)");

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let totalNegociacoes = 0;

  for (const t of tenants) {
    const etapasSemFunil = await prisma.stage.count({ where: { tenantId: t.id, funilId: null } });
    const contatos = await prisma.contact.findMany({
      where: { tenantId: t.id, stageId: { not: null }, negociacoes: { none: {} } },
      select: { id: true, name: true, phoneNumber: true, waJid: true, stageId: true, dealValueCents: true },
    });

    if (etapasSemFunil === 0 && contatos.length === 0) continue;
    console.log(`\n${t.name}: ${etapasSemFunil} etapa(s) a adotar, ${contatos.length} contato(s) a virar negociação`);
    if (!gravar) {
      totalNegociacoes += contatos.length;
      continue;
    }

    let funil = await prisma.funil.findFirst({ where: { tenantId: t.id, padrao: true, arquivadoEm: null } });
    if (!funil) {
      funil = await prisma.funil.upsert({
        where: { tenantId_nome: { tenantId: t.id, nome: "Funil de vendas" } },
        update: { padrao: true },
        create: { tenantId: t.id, nome: "Funil de vendas", padrao: true, position: 0 },
      });
    }

    await prisma.stage.updateMany({ where: { tenantId: t.id, funilId: null }, data: { funilId: funil.id } });

    const etapas = await prisma.stage.findMany({ where: { funilId: funil.id } });
    const nomeDaEtapa = new Map(etapas.map((e) => [e.id, e.name]));

    for (const c of contatos) {
      // Etapa de outro funil (não deveria existir antes da migração): pula.
      if (!c.stageId || !nomeDaEtapa.has(c.stageId)) continue;

      const quem = c.name?.trim() || c.phoneNumber || c.waJid.split("@")[0];
      await prisma.negociacao.create({
        data: {
          tenantId: t.id,
          contactId: c.id,
          funilId: funil.id,
          stageId: c.stageId,
          titulo: quem,
          valorCents: c.dealValueCents ?? 0,
          eventos: {
            create: { tipo: "CRIADA", paraStageId: c.stageId, paraEtapaNome: nomeDaEtapa.get(c.stageId), porNome: "Migração" },
          },
        },
      });
      totalNegociacoes += 1;
    }

    const motivos = await prisma.motivoDePerda.count({ where: { tenantId: t.id } });
    if (motivos === 0) {
      await prisma.motivoDePerda.createMany({
        data: MOTIVOS.map((nome) => ({ tenantId: t.id, nome })),
        skipDuplicates: true,
      });
    }
  }

  console.log(`\n${gravar ? "Criadas" : "A criar"}: ${totalNegociacoes} negociação(ões).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
