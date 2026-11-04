// Rodar com: npx tsx apps/worker/src/contato-e-edicao.test-manual.ts
// Dados fictícios.
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { proto } from "@whiskeysockets/baileys";
import { abrirEdicaoSecreta, lerVcard, montarVcard, textoDoContato } from "./contato-e-edicao";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`);
}

// Cifra como o WhatsApp (mesma derivação do voto de enquete), para provar a ida e volta.
function cifrar(segredo: Buffer, id: string, autor: string, editor: string, msg: proto.IMessage) {
  const extraido = createHmac("sha256", Buffer.alloc(32)).update(segredo).digest();
  const info = Buffer.concat([Buffer.from(id), Buffer.from(autor), Buffer.from(editor), Buffer.from("Message Edit"), Buffer.from([1])]);
  const chave = createHmac("sha256", extraido).update(info).digest();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  c.setAAD(Buffer.from(`${id}\u0000${editor}`));
  const corpo = Buffer.concat([c.update(proto.Message.encode(msg).finish()), c.final(), c.getAuthTag()]);
  return { encPayload: corpo, encIv: iv };
}

const segredo = randomBytes(32);
const lid = "111111111111111@lid";
const fone = "5511900000000@s.whatsapp.net";
const { encPayload, encIv } = cifrar(segredo, "ABC123", lid, lid, { conversation: "Data = 16/10/2026" });

checa(
  "abre a edição cifrada achando o autor entre telefone e LID",
  abrirEdicaoSecreta({ segredo, idOriginal: "ABC123", autoresOriginal: [fone, lid], autoresEdicao: [fone, lid], encPayload, encIv })?.conversation,
  "Data = 16/10/2026"
);
checa(
  "segredo errado não abre (devolve null, não lixo)",
  abrirEdicaoSecreta({ segredo: randomBytes(32), idOriginal: "ABC123", autoresOriginal: [lid], autoresEdicao: [lid], encPayload, encIv }),
  null
);

const vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:Maria Fictícia\nitem1.TEL;waid=5511988887777:+55 11 98888-7777\nitem1.X-ABLabel:Celular\nEND:VCARD";
checa("lê nome e telefone do vCard", lerVcard(vcard), { nome: "Maria Fictícia", telefones: ["+5511988887777"] });
checa("texto do contato no histórico", textoDoContato(vcard), "📇 Maria Fictícia\n+5511988887777");
checa("monta vCard que o WhatsApp entende", lerVcard(montarVcard("João Teste", "(11) 97777-6666")), { nome: "João Teste", telefones: ["+11977776666"] });

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
if (falhas) process.exit(1);
