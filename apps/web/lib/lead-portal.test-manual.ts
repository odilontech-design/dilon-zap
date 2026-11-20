// Lead da OLX → CRM. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/lead-portal.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { lerLead } from "@dilon-zap/portais";
import { registrarLeadDoPortal } from "./lead-portal";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const lead = (extra: object = {}) => {
  const r = lerLead({ source: "chat", listId: "8000005", linkAd: "https://www.olx.com.br/vi/8000005", name: "Maria Souza", email: "maria@email.com", phone: "21999999999", message: "Aceita troca?", createdAt: "2026-11-12T14:30:00Z", externalId: "e1", ...extra });
  if (!r.ok) throw new Error(r.erro);
  return r.lead;
};

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: "teste-leads" } });
  const t = await prisma.tenant.create({ data: { name: "Loja Leads", slug: "teste-leads" } });
  const v = await prisma.veiculo.create({
    data: { tenantId: t.id, marca: "Fiat", modelo: "Argo", versao: "1.0", anoFabricacao: 2022, anoModelo: 2023, km: 30000, precoCents: 7_500_000, status: "DISPONIVEL", origem: "COMPRA", placa: "ABC1D23" },
  });
  await prisma.publicacaoPortal.create({ data: { tenantId: t.id, veiculoId: v.id, portal: "OLX", idEnviado: "argo1", idExterno: "8000005", status: "PUBLICADO" } });

  const r1 = await registrarLeadDoPortal(t.id, lead());
  const neg = await prisma.negociacao.findUniqueOrThrow({ where: { id: r1.negociacaoId! }, include: { contact: true, tarefas: true } });
  checa("negociação com o carro e o valor", [neg.titulo, neg.valorCents, neg.origem], ["Fiat Argo 1.0 2022/2023 (OLX)", 7_500_000, "OLX"]);
  checa("contato com telefone e e-mail", [neg.contact.waJid, neg.contact.name, neg.contact.email], ["5521999999999@s.whatsapp.net", "Maria Souza", "maria@email.com"]);
  checa("tarefa de chamar no WhatsApp", [neg.tarefas.length, neg.tarefas[0].tipo, neg.tarefas[0].titulo.includes("chat da OLX") && neg.tarefas[0].titulo.includes("Aceita troca?")], [1, "WHATSAPP", true]);

  const r2 = await registrarLeadDoPortal(t.id, lead());
  checa("mesma entrega não duplica", [r2.duplicado, r2.negociacaoId], [true, r1.negociacaoId]);
  checa("só uma negociação", await prisma.negociacao.count({ where: { tenantId: t.id } }), 1);

  const r3 = await registrarLeadDoPortal(t.id, lead({ externalId: "e2", source: "whatsapp", message: "Ainda disponível?" }));
  checa("mesmo comprador, mesmo carro: soma tarefa", [r3.negociacaoId, await prisma.tarefaNegociacao.count({ where: { negociacaoId: r1.negociacaoId! } })], [r1.negociacaoId, 2]);

  const r4 = await registrarLeadDoPortal(t.id, lead({ externalId: "e3", name: "João", phone: "2133334444", listId: "999", adId: "", message: "" }));
  const neg4 = await prisma.negociacao.findUniqueOrThrow({ where: { id: r4.negociacaoId! }, include: { tarefas: true } });
  checa("anúncio desconhecido e fixo: ligar", [neg4.titulo, neg4.valorCents, neg4.tarefas[0].tipo], ["Anúncio da OLX", 0, "LIGACAO"]);

  const r5 = await registrarLeadDoPortal(t.id, lead({ externalId: "e4", name: "Ana", phone: undefined, email: "ana@email.com" }));
  const l5 = await prisma.leadPortal.findFirstOrThrow({ where: { tenantId: t.id, chave: "e4" } });
  checa("sem telefone: guardado, sem negociação", [r5.negociacaoId, r5.semTelefone, l5.semTelefone, l5.email], [null, true, true, "ana@email.com"]);

  const r6 = await registrarLeadDoPortal(t.id, lead({ externalId: "e5", listId: "x", adId: "argo1", name: "Pedro", phone: "21988887777" }));
  const neg6 = await prisma.negociacao.findUniqueOrThrow({ where: { id: r6.negociacaoId! } });
  checa("carro achado pelo adId", neg6.titulo, "Fiat Argo 1.0 2022/2023 (OLX)");

  const l1 = await prisma.leadPortal.findFirstOrThrow({ where: { tenantId: t.id, chave: "e1" } });
  checa("lead guardado com o carro", [l1.veiculoId, l1.origem, l1.recebidoEm.toISOString()], [v.id, "chat", "2026-11-12T14:30:00.000Z"]);

  // Outra loja não enxerga o carro desta: o mesmo listId lá vira "Anúncio da OLX".
  const t2 = await prisma.tenant.create({ data: { name: "Outra Loja", slug: "teste-leads-2" } });
  const r7 = await registrarLeadDoPortal(t2.id, lead({ externalId: "e1" }));
  const neg7 = await prisma.negociacao.findUniqueOrThrow({ where: { id: r7.negociacaoId! } });
  checa("isolamento entre lojas (mesma chave, outra loja)", [r7.duplicado, neg7.titulo, neg7.valorCents], [false, "Anúncio da OLX", 0]);

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-leads", "teste-leads-2"] } } });
  await prisma.$disconnect();
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
