// Grupos: identificação, nome do autor e trava de consulta. Puro, sem conexão.
// Dados fictícios. Rodar com: npx tsx apps/worker/src/grupos.test-manual.ts
import { ehGrupo, nomeDoAutor, tempoRestante, INTERVALO_SINCRONIZACAO_MS } from "./grupos";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`
  );
}

// ---------------------------------------------------------------------------
// O que é grupo
// ---------------------------------------------------------------------------

checa("grupo novo (120363...)", ehGrupo("120363000000000000@g.us"), true);
checa("grupo antigo (dono-criação)", ehGrupo("5521900000000-1600000000@g.us"), true);
checa("pessoa não é grupo", ehGrupo("5521900000000@s.whatsapp.net"), false);
checa("@lid não é grupo", ehGrupo("123456789@lid"), false);
checa("Status não é grupo", ehGrupo("status@broadcast"), false);
checa("vazio não é grupo", ehGrupo(undefined), false);

// ---------------------------------------------------------------------------
// Nome do autor
// ---------------------------------------------------------------------------

checa("pushName vem primeiro", nomeDoAutor("Maria Teste", "123@lid", "5521900000000@s.whatsapp.net"), "Maria Teste");
checa("pushName só com espaço não conta", nomeDoAutor("   ", undefined, "5521912345678@s.whatsapp.net"), "+55 21 91234-5678");
checa(
  "sem pushName: telefone do participantAlt quando o participant é @lid",
  nomeDoAutor(null, "987654321@lid", "5511934567890@s.whatsapp.net"),
  "+55 11 93456-7890"
);
checa("sem pushName: telefone do próprio participant", nomeDoAutor(undefined, "552133334444@s.whatsapp.net"), "+55 21 3333-4444");
checa("sufixo de aparelho é ignorado", nomeDoAutor(null, "5521912345678:7@s.whatsapp.net"), "+55 21 91234-5678");
checa("número estrangeiro sai com +", nomeDoAutor(null, "14155550100@s.whatsapp.net"), "+14155550100");
checa("só @lid: sem nome, nunca o id cru", nomeDoAutor(null, "987654321@lid"), null);
checa("nada: sem nome", nomeDoAutor(undefined), null);

// ---------------------------------------------------------------------------
// Trava de consulta
// ---------------------------------------------------------------------------

const agora = 1_800_000_000_000;
checa("nunca consultou: pode agora", tempoRestante(undefined, agora, INTERVALO_SINCRONIZACAO_MS), 0);
checa("consultou há 1 min: faltam 9", tempoRestante(agora - 60_000, agora, INTERVALO_SINCRONIZACAO_MS), 9 * 60_000);
checa("consultou há exatos 10 min: pode", tempoRestante(agora - INTERVALO_SINCRONIZACAO_MS, agora, INTERVALO_SINCRONIZACAO_MS), 0);
checa("consultou há 1 hora: pode", tempoRestante(agora - 3_600_000, agora, INTERVALO_SINCRONIZACAO_MS), 0);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
