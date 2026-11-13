import assert from "node:assert/strict";
import { entenderEmail, lerEmail } from "./lead-email";

let n = 0;
const ok = (nome: string) => { console.log(`ok    ${nome}`); n++; };

const email = (de: string, assunto: string, corpo: string, extra = "", html = false) =>
  [`From: ${de}`, "To: leads@loja.com", `Subject: ${assunto}`, `Message-ID: <${Math.random().toString(36).slice(2)}@x>`, "Date: Mon, 03 Nov 2026 10:00:00 -0300", "MIME-Version: 1.0", `Content-Type: text/${html ? "html" : "plain"}; charset=utf-8`, extra, "", corpo].join("\r\n");

async function main() {
  // Rótulos simples, como a maioria dos portais.
  let l = entenderEmail(await lerEmail(email("Na Pista <noreply@napista.com.br>", "Novo lead: Honda Civic 2.0 EXL 2018", "Nome: João da Silva\nTelefone: (21) 99876-5432\nE-mail: joao@gmail.com\nMensagem: Tenho interesse, aceita troca?\nainda disponível?\nVeículo: Honda Civic 2.0 EXL 2018\nPlaca: ABC1D23")));
  assert.ok(l.ok);
  if (l.ok) {
    assert.equal(l.lead.portal, "NAPISTA");
    assert.equal(l.lead.nome, "João da Silva");
    assert.equal(l.lead.telefone, "5521998765432");
    assert.equal(l.lead.email, "joao@gmail.com");
    assert.match(l.lead.mensagem, /aceita troca\? ainda disponível/);
    assert.equal(l.lead.placa, "ABC1D23");
    assert.equal(l.lead.veiculoTexto, "Honda Civic 2.0 EXL 2018");
  }
  ok("rótulos simples (Na Pista)");

  // Tabela em HTML (MobiAuto/Webmotors costumam vir assim).
  l = entenderEmail(await lerEmail(email("MobiAuto <contato@mobiauto.com.br>", "Interesse no seu veículo", "<table><tr><td>Nome</td><td>Maria Souza</td></tr><tr><td>Telefone</td><td>11 98765-4321</td></tr></table><p>Mensagem: Quero visitar</p>", "", true)));
  assert.ok(l.ok);
  if (l.ok) {
    assert.equal(l.lead.portal, "MOBIAUTO");
    assert.equal(l.lead.nome, "Maria Souza");
    assert.equal(l.lead.telefone, "5511987654321");
    assert.equal(l.lead.mensagem, "Quero visitar");
  }
  ok("tabela em HTML");

  // Encaminhado pelo Gmail da loja: o portal só aparece no corpo.
  l = entenderEmail(await lerEmail(email("Caio <vendascaiosales@gmail.com>", "Fwd: Novo lead Webmotors", "---------- Forwarded message ---------\nDe: Webmotors <leads@webmotors.com.br>\n\nNome: Pedro Lima\nCelular: 21 97777-1234\nMensagem: Qual o menor preço?")));
  assert.ok(l.ok);
  if (l.ok) {
    assert.equal(l.lead.portal, "WEBMOTORS");
    assert.equal(l.lead.telefone, "5521977771234");
    assert.equal(l.lead.nome, "Pedro Lima");
  }
  ok("encaminhado pelo Gmail");

  // Sem rótulo: acha o telefone e o e-mail soltos no texto, ignorando e-mail do sistema.
  l = entenderEmail(await lerEmail(email("Na Pista <noreply@napista.com.br>", "Contato", "Um cliente quer falar com você. Ligue para 21 96666-0000 ou escreva para ana@hotmail.com")));
  assert.ok(l.ok);
  if (l.ok) {
    assert.equal(l.lead.telefone, "5521966660000");
    assert.equal(l.lead.email, "ana@hotmail.com");
    assert.equal(l.lead.nome, "Contato do portal");
  }
  ok("telefone e e-mail soltos");

  // Preço não vira telefone.
  l = entenderEmail(await lerEmail(email("Na Pista <noreply@napista.com.br>", "Contato", "Veículo por R$ 79.999,00. E-mail: bia@gmail.com")));
  assert.ok(l.ok);
  if (l.ok) assert.equal(l.lead.telefone, null);
  ok("preço não é telefone");

  // O que não entendemos volta com motivo.
  let r = entenderEmail(await lerEmail(email("Alguém <a@b.com>", "Promoção", "Compre já")));
  assert.ok(!r.ok);
  if (!r.ok) assert.match(r.motivo, /portal/);
  r = entenderEmail(await lerEmail(email("Na Pista <noreply@napista.com.br>", "Contato", "Sem dados do cliente aqui")));
  assert.ok(!r.ok);
  if (!r.ok) assert.match(r.motivo, /telefone nem e-mail/);
  ok("não entendeu: devolve o motivo");

  // O mesmo e-mail dá a mesma chave (não duplica).
  const raw = email("Na Pista <noreply@napista.com.br>", "x", "Nome: A\nTelefone: 21999990000");
  const a = entenderEmail(await lerEmail(raw));
  const b = entenderEmail(await lerEmail(raw));
  assert.ok(a.ok && b.ok && a.lead.chave === b.lead.chave);
  ok("chave estável");
  console.log(`\ntudo certo (${n})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
