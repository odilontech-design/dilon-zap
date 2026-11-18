// Leitura da foto da OS: normalização da resposta da IA e chamada ao provedor. Sem rede.
// Rodar com: npx tsx apps/web/lib/otica-leitura.test-manual.ts
import assert from "node:assert/strict";
import { ErroDeLeitura, acharPorNome, lerDiaDoTalao, lerFotoDaOS, normalizarLeitura } from "./otica-leitura";

let n = 0;
const ok = (nome: string, f: () => void | Promise<void>) => Promise.resolve(f()).then(() => console.log(`ok ${++n} - ${nome}`));

async function main() {

const bruto = {
  numeroOS: "0498",
  dataVenda: "03/11/2026",
  cliente: { nome: "  Marilene Souza ", telefone: "(21) 98888-7777", cpf: "123.456.789-09", rg: null, nascimento: "15/04/1980", cep: "25000-000", endereco: "Rua A", numero: "10", bairro: "Centro", cidade: "Caxias", email: null },
  receita: {
    nomeUsuario: "Marilene", medico: "Dra. Ana", crm: "12345", dataConsulta: "01/11/2026",
    longe: { od: { esf: "+2,25", cil: "-0,50", eixo: "105", dnp: "34,5", alt: "22" }, oe: { esf: "+2,50", cil: "-0,75", eixo: "80", dnp: "340", alt: "22" } },
    perto: { od: { esf: null, cil: null, eixo: null, dnp: null, alt: null }, oe: { esf: null, cil: null, eixo: null, dnp: null, alt: null } },
    adicao: { od: "+1,50", oe: "+1,50" },
  },
  lentes: "Multifocal", materialLente: "resina", indiceLente: "1,67", tratamentos: ["antirreflexo", "UV Premium"], tratamentoCor: null,
  armacao: "A001 Acetato preta", materialArmacao: "acetato", servicos: ["montagem"], medidas: { ponte: "18", maiorDiagonal: "52", a: "50", b: "40" },
  laboratorio: "Lab Visão", pedidoLaboratorio: "P-778", previsaoData: "18/11/2026", previsaoHora: "16h", consultor: "Alef",
  valorTotal: "R$ 1.250,00", sinal: "525,00", formaDoSinal: "pix", observacoes: null, portadorAutorizado: null, duvidas: ["cliente.rg"],
};

await ok("lê número, datas e dinheiro no formato do formulário", () => {
  const { leitura: l, avisos, duvidas } = normalizarLeitura(bruto);
  assert.equal(l.numero, 498);
  assert.equal(l.dataVenda, "2026-11-03");
  assert.equal(l.cliente.nome, "Marilene Souza");
  assert.equal(l.cliente.nascimento, "1980-04-15");
  assert.equal(l.valor, "1250,00");
  assert.equal(l.sinal, "525,00");
  assert.equal(l.meioDoSinal, "PIX");
  assert.equal(l.previsaoDia, "2026-11-18");
  assert.equal(l.previsaoHora, "16:00");
  assert.deepEqual(avisos, []);
  assert.deepEqual(duvidas, ["cliente.rg"]);
});

await ok("graus e medidas viram o texto do formulário", () => {
  const { leitura: l } = normalizarLeitura(bruto);
  assert.equal(l.receita.grade.longe.od.esferico, "+2,25");
  assert.equal(l.receita.grade.longe.od.cilindrico, "-0,50");
  assert.equal(l.receita.grade.longe.od.eixo, "105");
  assert.equal(l.receita.grade.longe.od.dnp, "34,5");
  assert.equal(l.receita.grade.longe.oe.dnp, "34,0", "340 sem vírgula vira 34,0");
  assert.equal(l.receita.grade.adicao.od, "+1,50");
  assert.equal(l.medidas.ponte, "18,0");
  assert.equal(l.medidas.diagonal, "52,0");
});

await ok("opções conhecidas casam sem diferenciar maiúscula; o resto vai para as observações", () => {
  const { leitura: l } = normalizarLeitura(bruto);
  assert.equal(l.materialLente, "Resina");
  assert.equal(l.indiceLente, "1.67");
  assert.deepEqual(l.tratamentos, ["Antirreflexo"]);
  assert.deepEqual(l.servicos, ["Montagem"]);
  assert.match(l.observacoes, /Tratamento no talão: UV Premium/);
});

await ok("grau fora do passo de 0,25 vira vazio com aviso, e não um valor chutado", () => {
  const ruim = structuredClone(bruto);
  ruim.receita.longe.od.esf = "+2,30";
  const { leitura: l, avisos } = normalizarLeitura(ruim);
  assert.equal(l.receita.grade.longe.od.esferico, "");
  assert.ok(avisos.some((a) => a.includes("Longe OD esférico")));
});

await ok("data impossível, hora inválida e valor ilegível não passam", () => {
  assert.equal(lerDiaDoTalao("31/02/2026"), "");
  assert.equal(lerDiaDoTalao("5/3/26"), "2026-03-05");
  const ruim = structuredClone(bruto);
  ruim.previsaoData = "32/13/2026";
  ruim.previsaoHora = "25:00";
  ruim.valorTotal = "mil reais";
  const { leitura: l, avisos } = normalizarLeitura(ruim);
  assert.equal(l.previsaoDia, "");
  assert.equal(l.previsaoHora, "");
  assert.equal(l.valor, "");
  assert.equal(avisos.length, 2);
});

await ok("entrada estranha não derruba: lixo vira leitura vazia", () => {
  for (const x of [null, undefined, 42, "texto", [], { cliente: "x", receita: 3 }]) {
    const { leitura: l } = normalizarLeitura(x);
    assert.equal(l.numero, null);
    assert.equal(l.cliente.nome, "");
    assert.equal(l.receita.grade.longe.od.esferico, "");
  }
});

await ok("número de OS absurdo é ignorado", () => {
  assert.equal(normalizarLeitura({ numeroOS: "12345678901" }).leitura.numero, null);
  assert.equal(normalizarLeitura({ numeroOS: "OS 0498" }).leitura.numero, 498);
});

await ok("acharPorNome: igual, parecido único, ambíguo", () => {
  const labs = [{ id: "1", nome: "Lab Visão" }, { id: "2", nome: "Lab Norte" }, { id: "3", nome: "Norte Express" }];
  assert.equal(acharPorNome(labs, "lab visao")?.id, "1");
  assert.equal(acharPorNome(labs, "Visão")?.id, "1");
  assert.equal(acharPorNome(labs, "Norte"), null, "dois parecidos: não escolhe sozinho");
  assert.equal(acharPorNome(labs, ""), null);
});

await ok("chamada ao provedor: chave no cabeçalho, imagem em inlineData, JSON de volta", async () => {
  let visto: { url: string; headers: Record<string, string>; corpo: any } | null = null;
  const fetchFalso = (async (url: string, init: any) => {
    visto = { url, headers: init.headers, corpo: JSON.parse(init.body) };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(bruto) + "\n```" }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = (await lerFotoDaOS({ base64: "AAAA", mime: "image/jpeg" }, { chave: "chave-secreta-123", modelo: "gemini-x", fetchFn: fetchFalso })) as typeof bruto;
  assert.equal(r.numeroOS, "0498");
  assert.ok(visto!.url.includes("models/gemini-x:generateContent"));
  assert.ok(!visto!.url.includes("chave-secreta-123"), "a chave não vai na URL");
  assert.equal(visto!.headers["x-goog-api-key"], "chave-secreta-123");
  assert.equal(visto!.corpo.contents[0].parts[1].inlineData.data, "AAAA");
});

await ok("503 passageiro: repete o modelo e cai no reserva; 429 e 4xx não repetem", async () => {
  const bom = JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(bruto) }] } }] });
  // 503, 503 e o reserva responde: leu, e usou o reserva na terceira chamada.
  const modelos: string[] = [];
  const f1 = (async (url: string) => {
    modelos.push(String(url).match(/models\/([^:]+):/)![1]!);
    return modelos.length < 3 ? new Response("high demand", { status: 503 }) : new Response(bom, { status: 200 });
  }) as unknown as typeof fetch;
  const r = (await lerFotoDaOS({ base64: "A", mime: "image/png" }, { chave: "k-12345678", modelo: "principal", reserva: "reserva", esperaMs: 0, fetchFn: f1 })) as typeof bruto;
  assert.equal(r.numeroOS, "0498");
  assert.deepEqual(modelos, ["principal", "principal", "reserva"]);
  // Passa na segunda tentativa do mesmo modelo: não chega no reserva.
  const m2: string[] = [];
  const f2 = (async (url: string) => {
    m2.push(String(url).match(/models\/([^:]+):/)![1]!);
    return m2.length < 2 ? new Response("x", { status: 503 }) : new Response(bom, { status: 200 });
  }) as unknown as typeof fetch;
  await lerFotoDaOS({ base64: "A", mime: "image/png" }, { chave: "k-12345678", modelo: "principal", reserva: "reserva", esperaMs: 0, fetchFn: f2 });
  assert.deepEqual(m2, ["principal", "principal"]);
  // 400 não repete.
  let chamadas = 0;
  const f3 = (async () => (chamadas++, new Response("x", { status: 400 }))) as unknown as typeof fetch;
  await assert.rejects(lerFotoDaOS({ base64: "A", mime: "image/png" }, { chave: "k-12345678", esperaMs: 0, fetchFn: f3 }));
  assert.equal(chamadas, 1, "status 400 não repete");
});

await ok("429 do modelo principal (cota diária) vai direto ao reserva, sem repetir o principal", async () => {
  const bom = JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(bruto) }] } }] });
  const modelos: string[] = [];
  const f = (async (url: string) => {
    const m = String(url).match(/models\/([^:]+):/)![1]!;
    modelos.push(m);
    return m === "principal" ? new Response("quota", { status: 429 }) : new Response(bom, { status: 200 });
  }) as unknown as typeof fetch;
  const r = (await lerFotoDaOS({ base64: "A", mime: "image/png" }, { chave: "k-12345678", modelo: "principal", reserva: "reserva", esperaMs: 0, fetchFn: f })) as typeof bruto;
  assert.equal(r.numeroOS, "0498");
  assert.deepEqual(modelos, ["principal", "reserva"]);
  // Os dois sem cota: mensagem diz que é o limite diário e quando volta.
  const corpo = '{"error":{"message":"limit: 20 ... Please retry in 17h39m59.7s.","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}';
  const f2 = (async () => new Response(corpo, { status: 429 })) as unknown as typeof fetch;
  await assert.rejects(
    lerFotoDaOS({ base64: "A", mime: "image/png" }, { chave: "k-12345678", modelo: "principal", reserva: "reserva", esperaMs: 0, fetchFn: f2 }),
    (e: ErroDeLeitura) => e.status === 429 && /limite diário/.test(e.message) && /18 h/.test(e.message) && /uso pago/.test(e.message),
  );
});

await ok("erros do provedor viram mensagem clara, sem vazar a chave", async () => {
  const resp = (status: number, corpo: string) => (async () => new Response(corpo, { status })) as unknown as typeof fetch;
  await assert.rejects(lerFotoDaOS({ base64: "A", mime: "image/png" }, { chave: "", fetchFn: resp(200, "") }), (e: ErroDeLeitura) => e.status === 503);
  await assert.rejects(lerFotoDaOS({ base64: "A", mime: "image/png" }, { chave: "k-12345678", fetchFn: resp(429, "") }), (e: ErroDeLeitura) => e.status === 429 && /limite/.test(e.message));
  await assert.rejects(
    lerFotoDaOS({ base64: "A", mime: "image/png" }, { chave: "k-12345678", esperaMs: 0, fetchFn: resp(500, "falha com k-12345678 no meio") }),
    (e: ErroDeLeitura) => e.status === 502 && !e.message.includes("k-12345678"),
  );
  await assert.rejects(lerFotoDaOS({ base64: "A", mime: "image/png" }, { chave: "k", fetchFn: resp(200, JSON.stringify({ candidates: [] })) }), (e: ErroDeLeitura) => e.status === 422);
  await assert.rejects(
    lerFotoDaOS({ base64: "A", mime: "image/png" }, { chave: "k", fetchFn: resp(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: "não é json" }] } }] })) }),
    (e: ErroDeLeitura) => e.status === 422,
  );
});
}

main().then(() => console.log(`\n${n} verificações passaram`)).catch((e) => {
  console.error(e);
  process.exit(1);
});
