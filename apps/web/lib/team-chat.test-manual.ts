// Visibilidade dos canais do chat interno. Puro. Rodar com:
// npx tsx apps/web/lib/team-chat.test-manual.ts
import { podeVerCanal, podeVerConversaDireta, tipoDeConversa } from "./team-chat";
import { contextoDoChat, nomeParaLeitor, NOME_SUPORTE } from "./suporte-chat";
import { chaveDoCanal } from "./team-chat-leitura";

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

console.log("— suporte da Dilon Tech entre empresas —");
const cliente = { role: "OWNER" as const, tenantId: "cliente" };
const agente = { role: "AGENT" as const, tenantId: "cliente" };
const admin = { role: "SUPERADMIN" as const, tenantId: "dilon" };
checa("atendente não troca de empresa pelo parametro", contextoDoChat(agente, "outra").tenantId, "cliente");
checa("responsavel tambem nao troca", contextoDoChat(cliente, "outra").externo, false);
checa("superadmin fala na empresa indicada", contextoDoChat(admin, "cliente").tenantId, "cliente");
checa("superadmin na empresa indicada e externo", contextoDoChat(admin, "cliente").externo, true);
checa("superadmin sem parametro fica na propria", contextoDoChat(admin, null).externo, false);
checa("superadmin indicando a propria empresa nao e externo", contextoDoChat(admin, "dilon").externo, false);
const suporte = { id: "s1", tenantId: "dilon" };
checa("cliente ve o suporte sem rosto pessoal", nomeParaLeitor(agente, { id: "s1", name: "Felipe" }, suporte), NOME_SUPORTE);
checa("cliente ve colega pelo nome", nomeParaLeitor(agente, { id: "u2", name: "Ana" }, suporte), "Ana");
checa("a equipe da propria Dilon Tech ve o nome real", nomeParaLeitor({ role: "AGENT", tenantId: "dilon" }, { id: "s1", name: "Felipe" }, suporte), "Felipe");
checa("o proprio superadmin ve o nome real", nomeParaLeitor(admin, { id: "s1", name: "Felipe" }, suporte), "Felipe");
checa("sem suporte cadastrado mostra o nome", nomeParaLeitor(agente, { id: "s1", name: "Felipe" }, null), "Felipe");
checa("leitura do Geral de outra empresa tem chave propria", chaveDoCanal(null, null, "cliente"), "geral@cliente");
checa("Geral da propria empresa segue a chave antiga", chaveDoCanal(null, null), "geral");
checa("direta ignora a empresa", chaveDoCanal(null, "u2", "cliente"), "dm:u2");
checa("setor segue igual", chaveDoCanal("fiscal", null), "setor:fiscal");

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
