/**
 * Etapas de um funil de vendas de SaaS B2B de ticket médio/alto para a empresa
 * indicada, no funil padrão dela.
 *
 * Só escreve se o funil estiver SEM etapas: nunca mexe num funil que alguém já
 * montou. A segunda etapa é "Qualificado (SQL)" de propósito — é a que os
 * indicadores de SaaS usam por padrão para contar SQLs.
 *
 * Uso (dentro do container da VPS):
 *   npx tsx scripts/semear-etapas-saas.ts "Dilon Tech (interno)"
 */
import { prisma } from "@dilon-zap/db";

const ETAPAS = [
  { name: "Lead", color: "#64748B", probabilidade: 5 }, // entrou: site, indicação, outbound
  { name: "Qualificado (SQL)", color: "#0EA5E9", probabilidade: 15 }, // tem dor, verba, decisor e prazo
  { name: "Descoberta", color: "#6366F1", probabilidade: 25 }, // reunião de diagnóstico feita
  { name: "Demonstração", color: "#8B5CF6", probabilidade: 40 }, // demo ou prova de conceito
  { name: "Proposta enviada", color: "#F59E0B", probabilidade: 60 },
  { name: "Negociação", color: "#F97316", probabilidade: 75 }, // condições, jurídico, segurança
  { name: "Contrato e pagamento", color: "#16A34A", probabilidade: 90 }, // aguardando assinatura/1º pagamento
];

async function main() {
  const nome = process.argv[2];
  if (!nome) throw new Error("informe o nome da empresa");

  const tenant = await prisma.tenant.findFirstOrThrow({ where: { name: nome } });
  const funil = await prisma.funil.findFirstOrThrow({ where: { tenantId: tenant.id, padrao: true, arquivadoEm: null } });

  const existentes = await prisma.stage.count({ where: { funilId: funil.id } });
  if (existentes > 0) {
    console.log(`${nome}: o funil "${funil.nome}" já tem ${existentes} etapa(s). Nada feito.`);
    return;
  }

  await prisma.stage.createMany({
    data: ETAPAS.map((e, i) => ({ tenantId: tenant.id, funilId: funil.id, position: i, ...e })),
  });
  console.log(`${nome}: ${ETAPAS.length} etapas criadas em "${funil.nome}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
