// Visibilidade dos canais do chat interno. Puro. Rodar com:
// npx tsx apps/web/lib/team-chat.test-manual.ts
import { podeVerCanal, podeVerConversaDireta, tipoDeConversa } from "./team-chat";

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

console.log("— conversa direta 1 a 1 —");
checa("quem escreveu vê", podeVerConversaDireta("ana", "ana", "bia"), true);
checa("quem recebeu vê", podeVerConversaDireta("bia", "ana", "bia"), true);
checa("terceiro não vê", podeVerConversaDireta("cris", "ana", "bia"), false);
checa("ninguém tem exceção de papel: a função nem recebe o papel", podeVerConversaDireta("dono", "ana", "bia"), false);

console.log("— tipo de conversa —");
checa("sem setor e sem destinatário é Geral", tipoDeConversa(null, null), "GERAL");
checa("com setor é de setor", tipoDeConversa("fiscal", null), "SETOR");
checa("com destinatário é direta", tipoDeConversa(null, "bia"), "DIRETA");

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
