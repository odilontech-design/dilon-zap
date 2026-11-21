import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cadeiaDeHashes,
  crc16Kermit,
  dataHoraRep,
  gerarAej,
  gerarAfd,
  hashMarcacaoRep,
  nomeArquivoAfd,
  registroCabecalhoAfd,
  registroEventoAfd,
  registroMarcacaoAfd,
  TEXTO_ASSINATURA_P7S,
  type EntradaAfd,
  type MarcacaoRep,
} from "../src/rep";

const SP = "America/Sao_Paulo";
const empregador = { documento: "11222333000181", razaoSocial: "Padaria Pão de Ouro Ltda" };
const desenvolvedor = { documento: "12345678000195", registroInpi: "BR512026001234" };

test("CRC-16/KERMIT: o exemplo da própria especificação ('123456789' → 2189)", () => {
  assert.equal(crc16Kermit("123456789"), "2189");
});

test("data e hora no formato AAAA-MM-ddThh:mm:00ZZZZZ, segundos sempre 00", () => {
  assert.equal(dataHoraRep(new Date("2021-04-27T19:44:37Z"), SP), "2021-04-27T16:44:00-0300");
  assert.equal(dataHoraRep(new Date("2021-04-27T19:44:37Z"), "America/Manaus"), "2021-04-27T15:44:00-0400");
  assert.equal(dataHoraRep(new Date("2021-04-27T19:44:37Z"), SP).length, 24);
});

const m1: MarcacaoRep = {
  nsr: 3,
  marcadaEm: new Date("2026-11-10T11:00:12Z"),
  gravadaEm: new Date("2026-11-10T11:00:13Z"),
  cpf: "52998224725",
  coletor: "01",
  offline: false,
};

test("registro tipo 7: 137 posições e hash recalculável pelos campos 1 a 7 + hash anterior", () => {
  const hash = hashMarcacaoRep(m1, SP, null);
  const linha = registroMarcacaoAfd({ ...m1, hash }, SP);
  assert.equal(linha.length, 137);
  assert.equal(linha.slice(0, 9), "000000003");
  assert.equal(linha.slice(9, 10), "7");
  assert.equal(linha.slice(10, 34), "2026-11-10T08:00:00-0300");
  assert.equal(linha.slice(34, 46), "052998224725");
  assert.equal(linha.slice(70, 72), "01");
  assert.equal(linha.slice(72, 73), "0");
  // Quem tem só o arquivo consegue conferir o hash:
  assert.equal(createHash("sha256").update(linha.slice(0, 73)).digest("hex"), linha.slice(73));
});

test("a cadeia de hashes depende do registro anterior", () => {
  const m2 = { ...m1, nsr: 4, marcadaEm: new Date("2026-11-10T15:00:00Z"), gravadaEm: new Date("2026-11-10T15:00:01Z") };
  const [h1, h2] = cadeiaDeHashes([m2, m1], SP);
  assert.equal(h1, hashMarcacaoRep(m1, SP, null));
  assert.equal(h2, hashMarcacaoRep(m2, SP, h1));
  assert.notEqual(h2, hashMarcacaoRep(m2, SP, null));
});

const entrada = (): EntradaAfd => {
  const hash = hashMarcacaoRep(m1, SP, null);
  return {
    empregador,
    desenvolvedor,
    fuso: SP,
    dataInicial: "2026-11-01",
    dataFinal: "2026-11-30",
    geradoEm: new Date("2026-11-21T13:00:00Z"),
    eventos: [
      { tipo: 2, nsr: 1, gravadoEm: new Date("2026-11-01T12:00:00Z"), cpfResponsavel: "39053344705", empregador, localPrestacao: "Rua Exemplo, 10 - Duque de Caxias/RJ" },
      { tipo: 5, nsr: 2, gravadoEm: new Date("2026-11-01T12:05:00Z"), operacao: "I", cpf: "52998224725", nome: "João Pereira", cpfResponsavel: "39053344705" },
    ],
    marcacoes: [{ ...m1, hash }],
  };
};

test("cabeçalho (302), tipo 2 (331) e tipo 5 (118) com CRC no fim", () => {
  const e = entrada();
  const cab = registroCabecalhoAfd(e);
  assert.equal(cab.length, 302);
  assert.equal(cab.slice(0, 10), "0000000001");
  assert.equal(cab.slice(250, 253), "004");
  assert.equal(cab.slice(298), crc16Kermit(cab.slice(0, 298)));
  const r2 = registroEventoAfd(e.eventos[0], SP);
  assert.equal(r2.length, 331);
  assert.equal(r2.slice(327), crc16Kermit(r2.slice(0, 327)));
  const r5 = registroEventoAfd(e.eventos[1], SP);
  assert.equal(r5.length, 118);
  assert.equal(r5.slice(34, 35), "I");
});

test("tipo 6 (evento sensível) tem 36 posições e não leva CRC", () => {
  const r6 = registroEventoAfd({ tipo: 6, nsr: 9, gravadoEm: new Date("2026-11-01T12:00:00Z"), evento: "08" }, SP);
  assert.equal(r6.length, 36);
  assert.equal(r6.slice(-2), "08");
});

test("AFD completo: ordenado por NSR, CR LF, trailer com as contagens e linha de assinatura", () => {
  const { texto, bytes } = gerarAfd(entrada());
  const linhas = texto.split("\r\n");
  assert.equal(linhas.at(-1), ""); // termina em CR LF
  const reg = linhas.slice(0, -1);
  assert.equal(reg.length, 1 + 3 + 1 + 1);
  assert.deepEqual(reg.slice(1, 4).map((l) => l.slice(0, 9)), ["000000001", "000000002", "000000003"]);
  const trailer = reg[4];
  assert.equal(trailer.length, 64);
  assert.equal(trailer.slice(0, 9), "999999999");
  assert.equal(trailer.slice(9, 18), "000000001"); // tipo 2
  assert.equal(trailer.slice(36, 45), "000000001"); // tipo 5
  assert.equal(trailer.slice(54, 63), "000000001"); // tipo 7
  assert.equal(reg[5], TEXTO_ASSINATURA_P7S.padEnd(100, " "));
  assert.ok(!texto.includes("\n\r\n")); // sem linha em branco
  // ISO 8859-1: "ã" é um byte só (0xE3).
  assert.ok(bytes.includes(Buffer.from([0xe3])));
});

test("nome do arquivo: AFD + INPI + CNPJ do empregador + REP_P", () => {
  assert.equal(nomeArquivoAfd("BR 51 2026 001234", "11.222.333/0001-81"), "AFD512026001234" + "11222333000181" + "REP_P.txt");
});

test("AEJ: campos separados por |, contagens no trailer e motivo obrigatório no tratamento", () => {
  const base = {
    empregador,
    fuso: SP,
    dataInicial: "2026-11-01",
    dataFinal: "2026-11-30",
    geradoEm: new Date("2026-11-21T13:00:00Z"),
    registroInpi: desenvolvedor.registroInpi,
    vinculos: [{ id: 1, cpf: "52998224725", nome: "João Pereira" }],
    horarios: [{ codigo: "COMERCIAL", duracaoMin: 480, pares: [["0800", "1200"], ["1300", "1700"]] as Array<[string, string]> }],
    marcacoes: [
      { vinculo: 1, dataHora: new Date("2026-11-10T11:00:00Z"), tipo: "E" as const, par: 1, fonte: "O" as const, codHorario: "COMERCIAL" },
      { vinculo: 1, dataHora: new Date("2026-11-10T20:00:00Z"), tipo: "S" as const, par: 1, fonte: "I" as const, motivo: "Esqueceu de registrar" },
    ],
    ausencias: [{ vinculo: 1, tipo: 3 as const, data: "2026-11-10", minutos: 30, movimentoBanco: 1 as const }],
    programa: { nome: "Dilon Ponto", versao: "1.0", documentoDesenvolvedor: desenvolvedor.documento, razaoDesenvolvedor: "Dilon Tech", email: "contato@dilontech.com.br" },
  };
  const { texto } = gerarAej(base);
  const linhas = texto.split("\r\n").slice(0, -1);
  assert.equal(linhas[0].split("|")[0], "01");
  assert.equal(linhas[0].split("|").at(-1), "002");
  assert.ok(linhas.includes("02|1|3|512026001234"));
  assert.ok(linhas.includes("04|COMERCIAL|480|0800|1200|1300|1700"));
  assert.ok(linhas.some((l) => l.startsWith("05|1|2026-11-10T08:00:00-0300|1|E|001|O|COMERCIAL|")));
  assert.ok(linhas.some((l) => l.endsWith("|S|001|I||Esqueceu de registrar")));
  assert.ok(linhas.includes("07|1|3|2026-11-10|30|1"));
  assert.equal(linhas.at(-2), "99|1|1|1|1|2|0|1|1");
  assert.throws(() => gerarAej({ ...base, marcacoes: [{ ...base.marcacoes[1], motivo: null }] }));
});
