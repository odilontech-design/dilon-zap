import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { linksDoTexto, partirEmLinks } from "../../../apps/web/lib/links";

/** Regra pura, sem banco: onde começa e onde termina o endereço dentro do texto de uma mensagem. */

const juntar = (texto: string) =>
  partirEmLinks(texto)
    .map((t) => t.texto)
    .join("");

describe("links nas mensagens", () => {
  test("endereço sem https:// e com ponto final (o caso da conversa)", () => {
    const partes = partirEmLinks("dilontech.com.br/questionario/visuallis.");
    assert.deepEqual(partes, [
      { tipo: "link", texto: "dilontech.com.br/questionario/visuallis", href: "https://dilontech.com.br/questionario/visuallis" },
      { tipo: "texto", texto: "." },
    ]);
  });

  test("com protocolo: a vírgula da frase fica de fora e o sublinhado de dentro fica", () => {
    assert.deepEqual(linksDoTexto("veja https://exemplo.com/a_b_c, ok"), ["https://exemplo.com/a_b_c"]);
  });

  test("com www e domínio simples", () => {
    assert.deepEqual(linksDoTexto("www.site.com.br e dilontech.com.br"), ["https://www.site.com.br", "https://dilontech.com.br"]);
  });

  test("parêntese que fecha a frase fica de fora; o de dentro do endereço fica", () => {
    assert.deepEqual(linksDoTexto("(https://x.com/a)"), ["https://x.com/a"]);
    assert.deepEqual(linksDoTexto("https://pt.wikipedia.org/wiki/Foo_(bar)"), ["https://pt.wikipedia.org/wiki/Foo_(bar)"]);
  });

  test("marca de negrito e itálico colada no fim não entra no endereço", () => {
    assert.deepEqual(linksDoTexto("*https://x.com/a*"), ["https://x.com/a"]);
    assert.deepEqual(linksDoTexto("_dilontech.com.br_"), ["https://dilontech.com.br"]);
  });

  test("consulta e âncora fazem parte do endereço", () => {
    assert.deepEqual(linksDoTexto("https://x.com/p?a=1&b=2#topo"), ["https://x.com/p?a=1&b=2#topo"]);
  });

  test("duas ocorrências no mesmo texto", () => {
    assert.deepEqual(linksDoTexto("a.com.br e depois https://b.org/x"), ["https://a.com.br", "https://b.org/x"]);
  });

  test("e-mail, arquivo e número não viram link", () => {
    assert.deepEqual(linksDoTexto("fale com joao@gmail.com"), []);
    assert.deepEqual(linksDoTexto("anexei relatorio.pdf e a planilha v2.xlsx"), []);
    assert.deepEqual(linksDoTexto("custa 3.5 reais, às 10.30"), []);
  });

  test("só http e https: javascript: e afins nunca viram link", () => {
    assert.deepEqual(linksDoTexto("javascript:alert(1)"), []);
    assert.deepEqual(linksDoTexto("ftp://x.com/a"), []);
    assert.deepEqual(linksDoTexto("data:text/html,<b>oi</b>"), []);
  });

  test("underscore no meio de uma palavra não abre link (meu_site.com), mas o de itálico sim", () => {
    assert.deepEqual(linksDoTexto("o arquivo meu_site.com.br"), []);
    assert.deepEqual(linksDoTexto("veja _site.com.br_ agora"), ["https://site.com.br"]);
  });

  test("endereço sem ponto no domínio (localhost) não vira link", () => {
    assert.deepEqual(linksDoTexto("http://localhost:3000"), []);
  });

  test("juntar os pedaços devolve exatamente o texto original", () => {
    for (const t of [
      "dilontech.com.br/questionario/visuallis.",
      "oi\n\nveja https://exemplo.com/a_b_c, ok\ne www.x.com.br!",
      "(https://x.com/a) e (b.com)",
      "sem nenhum link aqui",
      "",
      "*negrito* https://x.com/a* fim",
    ]) {
      assert.equal(juntar(t), t);
    }
  });
});
