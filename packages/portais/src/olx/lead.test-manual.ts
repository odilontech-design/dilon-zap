// Leitura dos leads da OLX. Rodar com: npx tsx packages/portais/src/olx/lead.test-manual.ts
import { credencialConfere, credencialDoLead, lerLead, telefoneDoLead } from "./lead";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const exemplo = {
  source: "financing", adId: "a1234", listId: "12345689", linkAd: "https://www.olx.com.br/vi/12345689",
  name: "  Maria   Souza ", email: "Maria@Email.com", phone: "21999999999",
  message: "Olá, gostaria de saber mais informações", createdAt: "2026-11-12T14:30:00.500Z",
  buyerHistory: { adToExchange: { subject: "Honda Civic 2018", price: 78500 } }, externalId: "ext-1",
};
const r = lerLead(exemplo);
if (!r.ok) throw new Error(r.erro);
const l = r.lead;
checa("origem", l.origem, "financing");
checa("nome limpo", l.nome, "Maria Souza");
checa("e-mail minúsculo", l.email, "maria@email.com");
checa("telefone com DDI", l.telefone, "5521999999999");
checa("ids do anúncio", [l.idNoPortal, l.idEnviado], ["12345689", "a1234"]);
checa("chave é o externalId", l.chave, "ext-1");
checa("troca", l.troca, "Honda Civic 2018 (R$ 78.500)");
checa("data", l.criadoEm.toISOString(), "2026-11-12T14:30:00.500Z");

const sem = lerLead({ ...exemplo, externalId: undefined });
const sem2 = lerLead({ ...exemplo, externalId: undefined });
checa("chave estável sem externalId", sem.ok && sem2.ok && sem.lead.chave === sem2.lead.chave && sem.lead.chave.length === 32, true);
const outra = lerLead({ ...exemplo, externalId: undefined, message: "Outra pergunta" });
checa("mensagem diferente, chave diferente", sem.ok && outra.ok && sem.lead.chave !== outra.lead.chave, true);

checa("adId vazio = anúncio criado no portal", lerLead({ ...exemplo, adId: "" }).ok && (lerLead({ ...exemplo, adId: "" }) as any).lead.idEnviado, null);
checa("fonte desconhecida vira olx", (lerLead({ ...exemplo, source: "pombo" }) as any).lead.origem, "olx");
checa("sem nome", lerLead({ ...exemplo, name: "" }).ok, false);
checa("sem listId", lerLead({ ...exemplo, listId: undefined }).ok, false);
checa("corpo nulo", lerLead(null).ok, false);
checa("mensagem ausente vira vazia", (lerLead({ ...exemplo, message: undefined }) as any).lead.mensagem, "");

checa("telefone com 55", telefoneDoLead("5521999999999"), "5521999999999");
checa("telefone fixo com DDD", telefoneDoLead("2133334444"), "552133334444");
checa("telefone sem DDD", telefoneDoLead("999999999"), null);
checa("telefone vazio", telefoneDoLead(undefined), null);
checa("telefone com máscara", telefoneDoLead("(21) 99999-9999"), "5521999999999");

const c = credencialDoLead("tok", "segredo");
checa("credencial confere", credencialConfere(c, "tok", "segredo"), true);
checa("credencial com Bearer", credencialConfere(`Bearer ${c}`, "tok", "segredo"), true);
checa("credencial de outra loja", credencialConfere(c, "outro", "segredo"), false);
checa("sem credencial", credencialConfere(null, "tok", "segredo"), false);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
