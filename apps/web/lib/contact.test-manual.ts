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
  telefoneDoAutor("5521982146528@s.whatsapp.net"),
  "+55 21 98214-6528"
);
checa("fixo (8 dígitos) também formata", telefoneDoAutor("552133334444@s.whatsapp.net"), "+55 21 3333-4444");
checa(
  "@lid não é telefone: não inventa número",
  telefoneDoAutor("80384758927435@lid"),
  null
);
checa("sem autor (mensagem de chat 1:1) não tem telefone", telefoneDoAutor(null), null);
checa("undefined não quebra", telefoneDoAutor(undefined), null);
checa("JID de grupo não é pessoa", telefoneDoAutor("120363000000000000@g.us"), null);
checa("lixo curto não passa por telefone", telefoneDoAutor("0@s.whatsapp.net"), null);

console.log("\n— rótulo do contato —");
const base = { phoneNumber: null };
checa("nome cadastrado ganha de tudo", contactLabel({ ...base, name: "Ana Lucia", waJid: "5521982146528@s.whatsapp.net" }), "Ana Lucia");
checa(
  "sem nome, mostra o telefone formatado",
  contactLabel({ ...base, name: null, waJid: "5521982146528@s.whatsapp.net" }),
  "+55 21 98214-6528"
);
checa(
  "@lid com telefone resolvido mostra o telefone",
  contactLabel({ name: null, waJid: "80384758927435@lid", phoneNumber: "5521982146528" }),
  "+55 21 98214-6528"
);
checa(
  "@lid sem telefone: avisa em vez de imprimir o ID opaco (caso Ana Lucia/Camila)",
  contactLabel({ ...base, name: null, waJid: "80384758927435@lid" }),
  "Contato novo sem nome"
);
checa("grupo sem nome tem rótulo próprio", contactLabel({ ...base, name: null, waJid: "1203630000@g.us" }), "Grupo sem nome");

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
