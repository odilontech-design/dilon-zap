// Visibilidade dos canais do chat interno. Puro. Rodar com:
// npx tsx apps/web/lib/team-chat.test-manual.ts
import { podeVerCanal } from "./team-chat";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

console.log("— canal Geral —");
checa("AGENT vê o Geral mesmo sem setor nenhum", podeVerCanal("AGENT", [], null), true);
checa("FINANCEIRO vê o Geral", podeVerCanal("FINANCEIRO", [], null), true);
checa("OWNER vê o Geral", podeVerCanal("OWNER", [], null), true);

console.log("— canal de setor —");
checa("AGENT no setor vê o canal dele", podeVerCanal("AGENT", ["fiscal"], "fiscal"), true);
checa("AGENT fora do setor não vê", podeVerCanal("AGENT", ["fiscal"], "financeiro"), false);
checa("AGENT sem setor nenhum não vê nenhum canal de setor", podeVerCanal("AGENT", [], "fiscal"), false);
checa("FINANCEIRO segue a mesma regra de setor que o AGENT", podeVerCanal("FINANCEIRO", ["fiscal"], "financeiro"), false);
checa("membro de dois setores vê os dois", podeVerCanal("AGENT", ["fiscal", "financeiro"], "financeiro"), true);

console.log("— OWNER e SUPERADMIN veem tudo —");
checa("OWNER vê canal de setor que não é dele", podeVerCanal("OWNER", [], "fiscal"), true);
checa("SUPERADMIN vê canal de setor de qualquer tenant", podeVerCanal("SUPERADMIN", [], "fiscal"), true);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
