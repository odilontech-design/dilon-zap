// Rótulo e telefone de contato. Puro. Rodar com:
// npx tsx apps/web/lib/contact.test-manual.ts
import { contactLabel, telefoneDoAutor } from "./contact";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

console.log("— telefone do autor dentro de um grupo —");
checa(
  "JID de telefone vira número formatado",
  telefoneDoAutor("5521900005555@s.whatsapp.net"),
  "+55 21 90000-5555"
);
checa("fixo (8 dígitos) também formata", telefoneDoAutor("552133334444@s.whatsapp.net"), "+55 21 3333-4444");
checa(
  "@lid não é telefone: não inventa número",
  telefoneDoAutor("11112222333344@lid"),
  null
);
checa("sem autor (mensagem de chat 1:1) não tem telefone", telefoneDoAutor(null), null);
checa("undefined não quebra", telefoneDoAutor(undefined), null);
checa("JID de grupo não é pessoa", telefoneDoAutor("120363000000000000@g.us"), null);
checa("lixo curto não passa por telefone", telefoneDoAutor("0@s.whatsapp.net"), null);
checa(
  "@lid com telefone resolvido pelos membros do grupo (o caso real da Hemoderi)",
  telefoneDoAutor("99998888777766@lid", "5521900001234"),
  "+55 21 90000-1234"
);
checa(
  "telefone resolvido ganha do JID",
  telefoneDoAutor("5521911112222@s.whatsapp.net", "5521900001234"),
  "+55 21 90000-1234"
);
checa("telefone resolvido vazio cai pro JID", telefoneDoAutor("5521911112222@s.whatsapp.net", ""), "+55 21 91111-2222");
checa("@lid sem membro conhecido continua sem número", telefoneDoAutor("99998888777766@lid", null), null);

console.log("\n— rótulo do contato —");
const base = { phoneNumber: null };
checa("nome cadastrado ganha de tudo", contactLabel({ ...base, name: "Maria Teste", waJid: "5521900005555@s.whatsapp.net" }), "Maria Teste");
checa(
  "sem nome, mostra o telefone formatado",
  contactLabel({ ...base, name: null, waJid: "5521900005555@s.whatsapp.net" }),
  "+55 21 90000-5555"
);
checa(
  "@lid com telefone resolvido mostra o telefone",
  contactLabel({ name: null, waJid: "11112222333344@lid", phoneNumber: "5521900005555" }),
  "+55 21 90000-5555"
);
checa(
  "@lid sem telefone: avisa em vez de imprimir o ID opaco (contato novo sem nome)",
  contactLabel({ ...base, name: null, waJid: "11112222333344@lid" }),
  "Contato novo sem nome"
);
checa("grupo sem nome tem rótulo próprio", contactLabel({ ...base, name: null, waJid: "1203630000@g.us" }), "Grupo sem nome");

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
