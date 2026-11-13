// Central de leads por e-mail → CRM. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/lead-email.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { registrarEmailDeLead, novoTokenDeEmail, tenantDoToken } from "./lead-email";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const email = (id: string, de: string, assunto: string, corpo: string) =>
  [`From: ${de}`, `Subject: ${assunto}`, `Message-ID: <${id}@x>`, "Date: Mon, 03 Nov 2026 10:00:00 -0300", "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", corpo].join("\r\n");

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-lead-email", "teste-lead-email-2"] } } });
  const t = await prisma.tenant.create({ data: { name: "Loja Email", slug: "teste-lead-email" } });
  const t2 = await prisma.tenant.create({ data: { name: "Outra", slug: "teste-lead-email-2" } });
  const token = await novoTokenDeEmail(t.id);
  checa("token acha a loja certa", [await tenantDoToken(token), await tenantDoToken("errado")], [t.id, null]);
  await prisma.user.create({ data: { tenantId: t.id, name: "Vendedor A", email: "a-lead-email@t.com", passwordHash: "x", role: "AGENT" } });
  await prisma.user.create({ data: { tenantId: t.id, name: "Vendedor B", email: "b-lead-email@t.com", passwordHash: "x", role: "AGENT" } });
  const civic = await prisma.veiculo.create({ data: { tenantId: t.id, marca: "Honda", modelo: "Civic", versao: "EXL", anoFabricacao: 2017, anoModelo: 2018, km: 40000, precoCents: 9_000_000, status: "DISPONIVEL", origem: "COMPRA", placa: "ABC1D23" } });

  const r1 = await registrarEmailDeLead(t.id, email("m1", "Na Pista <noreply@napista.com.br>", "Novo lead", "Nome: João Silva\nTelefone: (21) 99876-5432\nMensagem: Aceita troca?\nPlaca: ABC1D23"));
  checa("lead entendido", r1.situacao, "PROCESSADO");
  const neg = await prisma.negociacao.findUniqueOrThrow({ where: { id: r1.negociacaoId! }, include: { tarefas: true } });
  checa("negociação do carro pela placa, origem Na Pista, sem vendedor (distribuição desligada)", [neg.titulo, neg.valorCents, neg.origem, neg.responsavelId, neg.tarefas.length], ["Honda Civic EXL 2017/2018 (Na Pista)", 9_000_000, "Na Pista", null, 1]);

  const r2 = await registrarEmailDeLead(t.id, email("m1", "Na Pista <noreply@napista.com.br>", "Novo lead", "Nome: João Silva\nTelefone: (21) 99876-5432"));
  checa("mesmo e-mail (mesmo Message-ID) não duplica", r2.situacao, "DUPLICADO");
  checa("uma negociação só", await prisma.negociacao.count({ where: { tenantId: t.id } }), 1);

  // Carro achado pelo texto (modelo + ano), com distribuição ligada.
  await prisma.veiculosConfig.update({ where: { tenantId: t.id }, data: { distribuirLeads: true } });
  const r3 = await registrarEmailDeLead(t.id, email("m2", "MobiAuto <x@mobiauto.com.br>", "Interesse", "Nome: Ana Lima\nCelular: 21 97777-0000\nVeículo: Honda Civic EXL 2018"));
  const neg3 = await prisma.negociacao.findUniqueOrThrow({ where: { id: r3.negociacaoId! } });
  checa("carro pelo texto e vendedor distribuído", [neg3.titulo, neg3.responsavelId !== null], ["Honda Civic EXL 2017/2018 (MobiAuto)", true]);
  const r4 = await registrarEmailDeLead(t.id, email("m3", "Webmotors <x@webmotors.com.br>", "Contato", "Nome: Pedro\nTelefone: 21 96666-1111\nVeículo: Outro Carro 2020"));
  const neg4 = await prisma.negociacao.findUniqueOrThrow({ where: { id: r4.negociacaoId! } });
  checa("segundo lead vai para o outro vendedor", neg4.responsavelId !== null && neg4.responsavelId !== neg3.responsavelId, true);

  const r5 = await registrarEmailDeLead(t.id, email("m4", "Promo <a@b.com>", "Oferta", "Compre já"));
  checa("e-mail desconhecido fica guardado", [r5.situacao, await prisma.emailDeLead.count({ where: { tenantId: t.id, situacao: "NAO_ENTENDIDO" } })], ["NAO_ENTENDIDO", 1]);

  const r6 = await registrarEmailDeLead(t2.id, email("m1", "Na Pista <noreply@napista.com.br>", "Novo lead", "Nome: João Silva\nTelefone: (21) 99876-5432\nPlaca: ABC1D23"));
  const neg6 = await prisma.negociacao.findUniqueOrThrow({ where: { id: r6.negociacaoId! } });
  checa("outra loja: mesma mensagem não é duplicada nem enxerga o carro", [r6.situacao, neg6.titulo], ["PROCESSADO", "Contato pelo Na Pista"]);
  void civic;

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-lead-email", "teste-lead-email-2"] } } });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await prisma.$disconnect();
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
