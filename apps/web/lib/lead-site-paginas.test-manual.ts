// Formulários "Venda seu carro" e "Financiamento" → CRM. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/lead-site-paginas.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { registrarAvaliacaoDoSite, registrarFinanciamentoDoSite } from "./lead-site";
import { PAGINAS } from "./vitrine-aparencia";
import { telefoneDoVisitante } from "./vitrine-formularios";
import { lojaPublica } from "./vitrine";
import fs from "node:fs";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

async function main() {
  // O middleware repete a lista de páginas: as duas precisam ser iguais.
  const mw = fs.readFileSync("middleware.ts", "utf8").match(/PAGINAS_DA_LOJA = new Set\(\[(.*?)\]\)/)?.[1] ?? "";
  checa("lista de páginas do middleware = PAGINAS", mw.split(",").map((x) => x.trim().replace(/"/g, "")), [...PAGINAS]);

  checa("telefone com máscara", telefoneDoVisitante("(21) 99999-9999"), "5521999999999");
  checa("telefone curto", telefoneDoVisitante("9999-9999"), null);

  await prisma.tenant.deleteMany({ where: { slug: "teste-paginas" } });
  const t = await prisma.tenant.create({ data: { name: "Loja Páginas", slug: "teste-paginas" } });
  await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "VEICULOS", ativo: true, motivo: "teste" } });
  await prisma.veiculosConfig.create({ data: { tenantId: t.id, vitrineAtiva: true, whatsapp: "5521967629631", nomeLoja: "Loja Páginas", corPrimaria: "#1E3A8A", instagram: "@lojapaginas", facebook: "https://facebook.com/lojapaginas", horario: "Seg a Sex 8h às 18h\nSáb 8h às 12h" } });
  const loja = (await lojaPublica("teste-paginas"))!;
  checa("aparência chega na loja pública", [loja.cor, loja.instagram, loja.facebook, loja.horario.length, loja.temLogo, loja.politica], ["#1e3a8a", "https://www.instagram.com/lojapaginas/", "https://www.facebook.com/lojapaginas", 2, false, null]);

  const v = await prisma.veiculo.create({ data: { tenantId: t.id, marca: "Fiat", modelo: "Argo", versao: "1.0 Drive", anoFabricacao: 2022, anoModelo: 2023, km: 31000, precoCents: 7_490_000, status: "DISPONIVEL", origem: "COMPRA" } });

  const a1 = await registrarAvaliacaoDoSite({ loja, nome: "Maria Souza", telefone: "5521999999999", marca: "Honda", modelo: "Civic EXL", ano: 2018, km: 62000, mensagem: "Está financiado" });
  const n1 = await prisma.negociacao.findUniqueOrThrow({ where: { id: a1.negociacaoId }, include: { tarefas: true, contact: true } });
  checa("avaliação: negociação sem valor e com origem", [n1.titulo, n1.valorCents, n1.origem], ["Avaliação: Honda Civic EXL 2018 (site)", 0, "Site · Venda seu carro"]);
  checa("avaliação: contato e tarefa de WhatsApp", [n1.contact.waJid, n1.tarefas.length, n1.tarefas[0].tipo, n1.tarefas[0].titulo.includes("62.000 km") && n1.tarefas[0].titulo.includes("Está financiado")], ["5521999999999@s.whatsapp.net", 1, "WHATSAPP", true]);

  const a2 = await registrarAvaliacaoDoSite({ loja, nome: "Maria Souza", telefone: "5521999999999", marca: "Honda", modelo: "Civic EXL", ano: 2018, km: 62000, mensagem: null });
  checa("mesmo envio de novo: soma tarefa, não duplica", [a2.negociacaoId, await prisma.negociacao.count({ where: { tenantId: t.id } }), await prisma.tarefaNegociacao.count({ where: { negociacaoId: a1.negociacaoId } })], [a1.negociacaoId, 1, 2]);

  const f1 = await registrarFinanciamentoDoSite({ loja, nome: "João Lima", telefone: "5521988887777", veiculoId: v.id, entradaCents: 1_500_000, mensagem: "Tenho um Gol para a troca" });
  const n2 = await prisma.negociacao.findUniqueOrThrow({ where: { id: f1.negociacaoId }, include: { tarefas: true } });
  checa("financiamento: carro, valor e origem", [n2.titulo, n2.valorCents, n2.origem], ["Financiamento: Fiat Argo 1.0 Drive 2022/2023 (site)", 7_490_000, "Site · Financiamento"]);
  checa("financiamento: entrada e troca na tarefa", [n2.tarefas[0].titulo.includes("entrada R$\u00a015.000"), n2.tarefas[0].titulo.includes("Gol")], [true, true]);

  const f2 = await registrarFinanciamentoDoSite({ loja, nome: "Ana", telefone: "5521977776666", veiculoId: null, entradaCents: null, mensagem: null });
  const n3 = await prisma.negociacao.findUniqueOrThrow({ where: { id: f2.negociacaoId } });
  checa("financiamento sem carro", [n3.titulo, n3.valorCents], ["Financiamento (site)", 0]);

  // Carro de outra loja não vaza para o título.
  const t2 = await prisma.tenant.create({ data: { name: "Outra", slug: "teste-paginas-2" } });
  const f3 = await registrarFinanciamentoDoSite({ loja: { ...loja, tenantId: t2.id }, nome: "Ana", telefone: "5521977776666", veiculoId: v.id, entradaCents: null, mensagem: null });
  const n4 = await prisma.negociacao.findUniqueOrThrow({ where: { id: f3.negociacaoId } });
  checa("carro de outra loja é ignorado", [n4.titulo, n4.valorCents], ["Financiamento (site)", 0]);

  // Cor inválida no banco não quebra a página: cai na cor padrão.
  await prisma.veiculosConfig.update({ where: { tenantId: t.id }, data: { corPrimaria: "red;background:url(x)" } });
  checa("cor inválida vira a padrão", (await lojaPublica("teste-paginas"))!.cor, "#1f6f4a");

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-paginas", "teste-paginas-2"] } } });
  await prisma.$disconnect();
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
