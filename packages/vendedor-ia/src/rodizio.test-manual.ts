// Rodízio de vendedores. Rodar com:
//   cd apps/web && DATABASE_URL=<banco de teste> npx tsx ../../packages/vendedor-ia/src/rodizio.test-manual.ts
// As regras puras rodam sem banco: npx tsx src/rodizio.test-manual.ts --sem-banco (de packages/vendedor-ia).
import { prisma } from "@dilon-zap/db";
import { atribuirPeloRodizio, proximoDoRodizio } from "./rodizio";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const prox = (participantes: string[], ultimoId: string | null, ativos: string[]) => proximoDoRodizio({ participantes, ultimoId, ativos: new Set(ativos) });

async function main() {
  // ---- escolha da vez (pura)
  checa("sem último: o primeiro", prox(["A", "B", "C"], null, ["A", "B", "C"]), "A");
  checa("depois do A vem o B, depois o C, e volta ao A", [prox(["A", "B", "C"], "A", ["A", "B", "C"]), prox(["A", "B", "C"], "B", ["A", "B", "C"]), prox(["A", "B", "C"], "C", ["A", "B", "C"])], ["B", "C", "A"]);
  checa("pula quem não está ativo", prox(["A", "B", "C"], "A", ["A", "C"]), "C");
  checa("o último saiu da lista: recomeça do primeiro", prox(["A", "B", "C"], "X", ["A", "B", "C"]), "A");
  checa("o último foi desativado: segue para quem vinha depois dele", prox(["A", "B", "C"], "B", ["A", "C"]), "C");
  checa("o último foi desativado e era o final da lista: volta ao começo", prox(["A", "B", "C"], "C", ["A", "B"]), "A");
  checa("ninguém ativo: ninguém", prox(["A", "B"], null, []), null);
  checa("lista vazia: ninguém", prox([], null, ["A"]), null);
  checa("um só participante: sempre ele", [prox(["A"], null, ["A"]), prox(["A"], "A", ["A"])], ["A", "A"]);
  checa("id repetido na lista não conta duas vezes", [prox(["A", "A", "B"], "A", ["A", "B"]), prox(["A", "A", "B"], "B", ["A", "B"])], ["B", "A"]);
  checa("quem não está na lista, mesmo ativo, nunca é escolhido", prox(["A", "B"], null, ["Z"]), null);

  if (process.argv.includes("--sem-banco")) {
    console.log(falhas === 0 ? "\ntudo certo (sem banco)" : `\n${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  }

  // ---- atribuição com banco
  const SLUGS = ["teste-rodizio-a", "teste-rodizio-b"];
  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  const agora = new Date("2026-11-26T15:00:00Z"); // 12h em Brasília
  const A = await prisma.tenant.create({ data: { name: SLUGS[0], slug: SLUGS[0] } });
  const B = await prisma.tenant.create({ data: { name: SLUGS[1], slug: SLUGS[1] } });
  const sessaoA = await prisma.whatsAppSession.create({ data: { tenantId: A.id, status: "CONNECTED" } });
  const sessaoB = await prisma.whatsAppSession.create({ data: { tenantId: B.id, status: "CONNECTED" } });
  const user = (t: { id: string }, nome: string, desativado = false) => prisma.user.create({ data: { tenantId: t.id, name: nome, email: `${nome}-${t.id}@rod.com`, passwordHash: "x", role: "AGENT", deactivatedAt: desativado ? new Date() : null } });
  const u1 = await user(A, "U1");
  const u2 = await user(A, "U2");
  const u3 = await user(A, "U3", true); // desativado
  const forasteiro = await user(B, "Forasteiro"); // de outra empresa
  const cfg = (ligado: boolean, ids: string[]) => prisma.vendedorIaConfig.upsert({ where: { tenantId: A.id }, create: { tenantId: A.id, ativo: true, rodizio: ligado, rodizioUsuarioIds: ids }, update: { rodizio: ligado, rodizioUsuarioIds: ids, rodizioUltimoId: null } });
  const loja = async () => {
    const c = await prisma.vendedorIaConfig.findUniqueOrThrow({ where: { tenantId: A.id } });
    return { tenantId: A.id, rodizio: c.rodizio, rodizioUsuarioIds: c.rodizioUsuarioIds, rodizioUltimoId: c.rodizioUltimoId, tenant: { timezone: "America/Sao_Paulo" } };
  };
  let n = 0;
  const conversa = async (t: { id: string }, sessaoId: string, assignedToId: string | null = null) => {
    n++;
    const contato = await prisma.contact.create({ data: { tenantId: t.id, waJid: `5521987${String(n).padStart(6, "0")}@s.whatsapp.net`, name: `Cliente ${n}` } });
    return prisma.conversation.create({ data: { tenantId: t.id, contactId: contato.id, sessionId: sessaoId, status: "PENDING", assignedToId } });
  };
  const dono = (id: string) => prisma.conversation.findUniqueOrThrow({ where: { id }, select: { assignedToId: true, assignedAt: true, assignedById: true, assignmentSeenAt: true } });

  await cfg(true, [u1.id, u2.id, u3.id, forasteiro.id]);
  const c1 = await conversa(A, sessaoA.id);
  const c2 = await conversa(A, sessaoA.id);
  const c3 = await conversa(A, sessaoA.id);
  const r1 = await atribuirPeloRodizio(c1.id, await loja(), "negociação", agora);
  const r2 = await atribuirPeloRodizio(c2.id, await loja(), "visita ou test drive", agora);
  const r3 = await atribuirPeloRodizio(c3.id, await loja(), "financiamento", agora);
  checa("rodízio: U1, U2, U1 (o desativado e o de outra empresa não entram)", [r1, r2, r3], [u1.id, u2.id, u1.id]);
  const d1 = await dono(c1.id);
  checa("a conversa fica com o responsável, atribuída agora, sem 'quem passou' e com o aviso do Inbox por ver", [d1.assignedToId === u1.id, d1.assignedAt?.getTime() === agora.getTime(), d1.assignedById, d1.assignmentSeenAt], [true, true, null, null]);
  checa("o ponteiro do rodízio guarda o último", (await prisma.vendedorIaConfig.findUniqueOrThrow({ where: { tenantId: A.id } })).rodizioUltimoId, u1.id);

  // quem já tem responsável nunca muda de mãos
  const cDono = await conversa(A, sessaoA.id, u2.id);
  checa("conversa que já tem responsável: intocada", [await atribuirPeloRodizio(cDono.id, await loja(), "negociação", agora), (await dono(cDono.id)).assignedToId === u2.id], [null, true]);
  // a equipe respondeu: já está com uma pessoa
  const cEq = await conversa(A, sessaoA.id);
  checa("'equipe respondeu': ninguém é atribuído", [await atribuirPeloRodizio(cEq.id, await loja(), "equipe respondeu", agora), (await dono(cEq.id)).assignedToId], [null, null]);
  // conversa de outra empresa com a loja errada
  const cB = await conversa(B, sessaoB.id);
  checa("conversa de outra empresa: nada", [await atribuirPeloRodizio(cB.id, await loja(), "negociação", agora), (await dono(cB.id)).assignedToId], [null, null]);

  // desligado, sem participantes, ninguém ativo
  await cfg(false, [u1.id, u2.id]);
  const cOff = await conversa(A, sessaoA.id);
  checa("rodízio desligado: nada", await atribuirPeloRodizio(cOff.id, await loja(), "negociação", agora), null);
  await cfg(true, []);
  checa("ligado, mas sem ninguém marcado: nada", await atribuirPeloRodizio(cOff.id, await loja(), "negociação", agora), null);
  await cfg(true, [u3.id, forasteiro.id]);
  checa("ligado, mas só com desativado e gente de fora: nada", await atribuirPeloRodizio(cOff.id, await loja(), "negociação", agora), null);
  checa("e a conversa segue sem responsável", (await dono(cOff.id)).assignedToId, null);

  // duas passagens na mesma volta não caem na mesma pessoa (o ponteiro é lido do banco na hora)
  await cfg(true, [u1.id, u2.id]);
  const lojaVelha = await loja(); // com o ponteiro em null, como a volta do worker leria uma vez só
  const x1 = await conversa(A, sessaoA.id);
  const x2 = await conversa(A, sessaoA.id);
  const rx1 = await atribuirPeloRodizio(x1.id, lojaVelha, "negociação", agora);
  const rx2 = await atribuirPeloRodizio(x2.id, lojaVelha, "negociação", agora);
  checa("duas passagens seguidas com a mesma config lida: pessoas diferentes", [rx1, rx2], [u1.id, u2.id]);
  // Ponta a ponta: a ferramenta que a IA usa para passar a conversa já chama o rodízio.
  const { executarFerramenta } = await import("./executar");
  await cfg(true, [u1.id, u2.id]);
  const cfgRow = await prisma.vendedorIaConfig.findUniqueOrThrow({ where: { tenantId: A.id } });
  const lojaCompleta = { ...cfgRow, tenant: { name: SLUGS[0], slug: SLUGS[0], timezone: "America/Sao_Paulo", veiculosConfig: null } };
  const pt = await conversa(A, sessaoA.id);
  const ctx = { agora, conversa: { id: pt.id, tenantId: A.id, sessionId: sessaoA.id, setorId: null }, deps: {}, loja: lojaCompleta } as never;
  const res = await executarFerramenta({ name: "transferir_para_vendedor", input: { motivo: "visita", resumo: "quer ver o Argo amanhã" } }, ctx);
  const depois = await prisma.conversation.findUniqueOrThrow({ where: { id: pt.id }, select: { status: true, assignedToId: true } });
  const ia = await prisma.vendedorIaConversa.findUniqueOrThrow({ where: { conversationId: pt.id }, select: { status: true, motivo: true } });
  checa("ferramenta de passar a conversa: transfere, vai para Pendentes e já tem o vendedor da vez", [res.transferiu, ia.status, ia.motivo, depois.status, depois.assignedToId === u1.id || depois.assignedToId === u2.id], [true, "TRANSFERIDA", "visita ou test drive", "PENDING", true]);


  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch(async (e) => {
  console.error(e);
  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-rodizio-a", "teste-rodizio-b"] } } }).catch(() => {});
  process.exit(1);
});
