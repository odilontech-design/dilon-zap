// Aviso de mensagem nova do Instagram. Rodar de apps/web com:
//   DATABASE_URL=postgresql://postgres@localhost:5439/zap npx tsx lib/aviso-instagram.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { avisarInstagramNovo, corpoDoAvisoInstagram, destinatariosDoAvisoInstagram, esquecerAvisosInstagram, tituloDoAvisoInstagram } from "./aviso-instagram";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const SLUGS = ["teste-aviso-ig-a", "teste-aviso-ig-b"];
async function main() {
  checa("título: nome, senão @usuário, senão 'Cliente'", [tituloDoAvisoInstagram("Ana Souza", "ana"), tituloDoAvisoInstagram(null, "ana.souza"), tituloDoAvisoInstagram(" ", null)], ["Instagram: Ana Souza", "Instagram: @ana.souza", "Instagram: Cliente"]);
  checa("corpo: texto curto, longo cortado e vazio", [corpoDoAvisoInstagram("  Oi,   tem o Polo? "), corpoDoAvisoInstagram("x".repeat(300)).length, corpoDoAvisoInstagram("  ")], ["Oi, tem o Polo?", 140, "Nova mensagem"]);

  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  const a = await prisma.tenant.create({ data: { name: SLUGS[0], slug: SLUGS[0] } });
  const b = await prisma.tenant.create({ data: { name: SLUGS[1], slug: SLUGS[1] } });
  await prisma.tenantRecurso.create({ data: { tenantId: a.id, recurso: "VEICULOS", ativo: true } });
  const u = (tenantId: string, email: string, role: "OWNER" | "AGENT", extra: object = {}) => prisma.user.create({ data: { tenantId, name: email, email, passwordHash: "x", role, ...extra } });
  const dono = await u(a.id, "dono-aig@t.com", "OWNER");
  const vend = await u(a.id, "vend-aig@t.com", "AGENT");
  await u(a.id, "saiu-aig@t.com", "AGENT", { deactivatedAt: new Date() });
  await u(b.id, "outra-aig@t.com", "OWNER");

  checa("destinatários: a equipe ativa da empresa (sem desativados e sem outra empresa)", (await destinatariosDoAvisoInstagram(a.id)).sort(), [dono.id, vend.id].sort());
  checa("empresa sem o módulo de veículos: ninguém é avisado", await destinatariosDoAvisoInstagram(b.id), []);

  const enviados: { id: string; titulo: string; tag?: string }[] = [];
  const enviar = async (id: string, aviso: { titulo: string; tag?: string }) => { enviados.push({ id, titulo: aviso.titulo, tag: aviso.tag }); };
  esquecerAvisosInstagram();
  const t0 = 1_000_000;
  const n1 = await avisarInstagramNovo({ tenantId: a.id, conversaId: "c1", nome: "Ana", username: "ana", texto: "Oi" }, enviar, t0);
  checa("primeira mensagem: avisa os 2 da equipe, com o título e a tag da conversa", [n1, enviados.length, enviados[0].titulo, enviados[0].tag], [2, 2, "Instagram: Ana", "instagram:c1"]);
  const n2 = await avisarInstagramNovo({ tenantId: a.id, conversaId: "c1", nome: "Ana", username: "ana", texto: "tudo bem?" }, enviar, t0 + 20_000);
  checa("rajada na mesma conversa (20 s depois): não avisa de novo", [n2, enviados.length], [0, 2]);
  const n3 = await avisarInstagramNovo({ tenantId: a.id, conversaId: "c2", nome: null, username: "joao", texto: "oi" }, enviar, t0 + 20_000);
  checa("outra conversa no mesmo instante: avisa", [n3, enviados.length], [2, 4]);
  const n4 = await avisarInstagramNovo({ tenantId: a.id, conversaId: "c1", nome: "Ana", username: "ana", texto: "e então?" }, enviar, t0 + 61_000);
  checa("mais de 1 minuto depois: avisa de novo", [n4, enviados.length], [2, 6]);
  const falha = async () => { throw new Error("push fora do ar"); };
  esquecerAvisosInstagram();
  checa("push que falha não derruba o recebimento da mensagem", await avisarInstagramNovo({ tenantId: a.id, conversaId: "c9", nome: "X", username: null, texto: "oi" }, falha, t0), 2);

  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } }).catch(() => {}); process.exit(1); });
