import { test } from "node:test";
import assert from "node:assert/strict";
import { apurarDia, distribuirExtras, type EntradaDia } from "../src/apuracao";
import { REGRAS_CLT_PADRAO, regras, type RegrasCalculo } from "../src/regras";
import { hhmm } from "../src/tempo";
import { bat, COMERCIAL, DOZE_TRINTA_SEIS, NOTURNO } from "./fixtures";

const R = REGRAS_CLT_PADRAO;
const util = (marcacoes: string, extra: Partial<EntradaDia> = {}, r: RegrasCalculo = R) =>
  apurarDia({ tipoDia: "UTIL", previsto: COMERCIAL, marcacoes: marcacoes ? bat(marcacoes) : [], ...extra }, r);

// ── Jornada cumprida e tolerância (art. 58, §1º; Súmula 366) ───────────────

test("jornada cumprida no horário: saldo zero e nenhuma ocorrência", () => {
  const d = util("08:00 12:00 13:00 17:00");
  assert.equal(d.trabalhadoMin, 480);
  assert.equal(d.saldoMin, 0);
  assert.deepEqual(d.ocorrencias, []);
  assert.deepEqual(d.intervalo, { exigidoMin: 60, gozadoMin: 60, suprimidoMin: 0 });
});

test("variações de até 5 min por marcação somando 10 no dia não contam", () => {
  const d = util("07:57 12:02 12:59 17:04"); // 3 + 2 + 1 + 4 = 10
  assert.equal(d.trabalhadoMin, 490);
  assert.equal(d.toleranciaAplicada, true);
  assert.equal(d.saldoMin, 0);
  assert.equal(d.extraMin, 0);
});

test("uma marcação com 6 min: conta a diferença inteira, não só o 1 minuto que passou", () => {
  const d = util("08:00 12:00 13:00 17:06");
  assert.equal(d.toleranciaAplicada, false);
  assert.equal(d.saldoMin, 6);
  assert.deepEqual(d.extras, [{ percentualBp: 5000, minutos: 6 }]);
});

test("cada marcação dentro dos 5 min, mas a soma passa de 10: conta tudo", () => {
  const d = util("07:56 12:03 12:58 17:04"); // 4 + 3 + 2 + 4 = 13
  assert.equal(d.toleranciaAplicada, false);
  assert.equal(d.saldoMin, 13);
});

test("tolerância vale para menos também: sair 4 min mais cedo não vira débito", () => {
  const d = util("08:00 12:00 13:00 16:56");
  assert.equal(d.saldoMin, 0);
  assert.equal(d.saidaAntecipadaMin, 0);
});

// ── Atraso, falta e abono ───────────────────────────────────────────────────

test("30 min de atraso sem compensar: débito de 30 e ocorrência de atraso", () => {
  const d = util("08:30 12:00 13:00 17:00");
  assert.equal(d.saldoMin, -30);
  assert.equal(d.debitoMin, 30);
  assert.equal(d.atrasoMin, 30);
  assert.deepEqual(d.ocorrencias, ["ATRASO"]);
});

test("atraso compensado na saída zera o saldo, mas o atraso continua informado", () => {
  const d = util("08:20 12:00 13:00 17:20");
  assert.equal(d.saldoMin, 0);
  assert.equal(d.atrasoMin, 20);
  assert.deepEqual(d.ocorrencias, ["ATRASO"]);
});

test("dia útil sem nenhuma marcação é falta com débito da jornada inteira", () => {
  const d = util("");
  assert.equal(d.falta, true);
  assert.equal(d.debitoMin, 480);
  assert.deepEqual(d.ocorrencias, ["FALTA"]);
  assert.equal(d.intervalo.exigidoMin, 0);
});

test("falta coberta por atestado: sem débito e sem ocorrência de falta", () => {
  const d = util("", { abonoMin: 480 });
  assert.equal(d.debitoMin, 0);
  assert.equal(d.abonoUsadoMin, 480);
  assert.deepEqual(d.ocorrencias, []);
});

test("abono parcial cobre só o que abonou", () => {
  const d = util("10:00 12:00 13:00 17:00", { abonoMin: 60 }); // chegou 2h depois, consulta de 1h
  assert.equal(d.debitoMin, 60);
  assert.equal(d.abonoUsadoMin, 60);
});

test("abono nunca vira hora extra", () => {
  const d = util("08:00 12:00 13:00 17:00", { abonoMin: 60 });
  assert.equal(d.saldoMin, 0);
  assert.equal(d.abonoUsadoMin, 0);
});

// ── Marcação ímpar ──────────────────────────────────────────────────────────

test("marcação ímpar: o dia fica incompleto e o sistema NÃO inventa a saída", () => {
  const d = util("08:00 12:00 13:00");
  assert.equal(d.incompleto, true);
  assert.equal(d.periodos.length, 1);
  assert.equal(d.trabalhadoMin, 240);
  assert.ok(d.ocorrencias.includes("MARCACAO_IMPAR"));
});

test("marcações fora de ordem são ordenadas antes de formar os pares", () => {
  const d = apurarDia({ tipoDia: "UTIL", previsto: COMERCIAL, marcacoes: bat("13:00 08:00 17:00 12:00") }, R);
  assert.equal(d.saldoMin, 0);
});

test("marcação que não é minuto inteiro é recusada", () => {
  assert.throws(() => apurarDia({ tipoDia: "UTIL", previsto: COMERCIAL, marcacoes: [480.5] }, R));
});

// ── Hora extra ──────────────────────────────────────────────────────────────

test("faixas de convenção: 2 primeiras horas a 50%, o resto a 100%", () => {
  const cct = regras({
    extrasDiaUtil: [
      { ateMin: 120, percentualBp: 5000 },
      { ateMin: null, percentualBp: 10000 },
    ],
  });
  const d = util("08:00 12:00 13:00 20:00", {}, cct);
  assert.equal(d.extraMin, 180);
  assert.deepEqual(d.extras, [
    { percentualBp: 5000, minutos: 120 },
    { percentualBp: 10000, minutos: 60 },
  ]);
  assert.deepEqual(d.ocorrencias, ["HORA_EXTRA", "LIMITE_EXTRA_EXCEDIDO"]);
});

test("2 horas extras exatas não passam do limite do art. 59", () => {
  const d = util("08:00 12:00 13:00 19:00");
  assert.equal(d.extraMin, 120);
  assert.deepEqual(d.ocorrencias, ["HORA_EXTRA"]);
});

test("faixas que não cobrem tudo são erro de configuração", () => {
  assert.throws(() => distribuirExtras(200, [{ ateMin: 120, percentualBp: 5000 }]));
});

// ── Descanso, domingo e feriado ─────────────────────────────────────────────

test("domingo trabalhado: tudo é extra a 100% e não conta no limite diário", () => {
  const d = apurarDia({ tipoDia: "DESCANSO", previsto: [], marcacoes: bat("08:00 12:00") }, R);
  assert.equal(d.descanso, true);
  assert.deepEqual(d.extras, [{ percentualBp: 10000, minutos: 240 }]);
  assert.deepEqual(d.ocorrencias, ["TRABALHO_EM_DESCANSO"]);
});

test("domingo sem trabalho: nada a apurar", () => {
  const d = apurarDia({ tipoDia: "DESCANSO", previsto: [], marcacoes: [] }, R);
  assert.equal(d.saldoMin, 0);
  assert.equal(d.falta, false);
  assert.deepEqual(d.ocorrencias, []);
});

test("feriado num dia que teria jornada: não trabalhar não é falta", () => {
  const d = apurarDia({ tipoDia: "FERIADO", previsto: COMERCIAL, marcacoes: [] }, R);
  assert.equal(d.falta, false);
  assert.equal(d.debitoMin, 0);
});

test("feriado trabalhado vira extra a 100%", () => {
  const d = apurarDia({ tipoDia: "FERIADO", previsto: COMERCIAL, marcacoes: bat("08:00 12:00 13:00 17:00") }, R);
  assert.deepEqual(d.extras, [{ percentualBp: 10000, minutos: 480 }]);
});

test("12x36 (art. 59-A): feriado na escala é dia normal quando a regra diz isso", () => {
  const escala = regras({ feriadoTrabalhadoComoExtra: false });
  const d = apurarDia(
    { tipoDia: "FERIADO", previsto: DOZE_TRINTA_SEIS, marcacoes: bat("07:00 13:00 14:00 19:00") },
    escala,
  );
  assert.equal(d.saldoMin, 0);
  assert.deepEqual(d.ocorrencias, []);
});

test("12x36 com feriado pago como extra (convenção que mantém a dobra)", () => {
  const d = apurarDia(
    { tipoDia: "FERIADO", previsto: DOZE_TRINTA_SEIS, marcacoes: bat("07:00 13:00 14:00 19:00") },
    R,
  );
  assert.deepEqual(d.extras, [{ percentualBp: 10000, minutos: 660 }]);
});

// ── Turno noturno ───────────────────────────────────────────────────────────

test("turno que atravessa a meia-noite é apurado inteiro no dia em que começou", () => {
  const d = apurarDia({ tipoDia: "UTIL", previsto: NOTURNO, marcacoes: bat("22:00 02:00+1 03:00+1 06:00+1") }, R);
  assert.equal(d.trabalhadoMin, 420);
  // 22–02 + 03–05 + prorrogação 05–06: as 7 horas são noturnas
  assert.equal(d.noturnoMin, 420);
  assert.equal(d.noturnoReduzidoMin, 480);
  assert.equal(d.previstoComputadoMin, 480);
  assert.equal(d.saldoMin, 0);
  assert.deepEqual(d.ocorrencias, []);
});

test("hora extra depois das 5h em turno noturno também é reduzida (Súmula 60)", () => {
  const d = apurarDia({ tipoDia: "UTIL", previsto: NOTURNO, marcacoes: bat("22:00 02:00+1 03:00+1 07:00+1") }, R);
  assert.equal(d.trabalhadoMin, 480);
  assert.equal(d.noturnoMin, 480);
  assert.equal(d.noturnoReduzidoMin, 549); // 480 × 8/7 = 548,57
  // Previsto vale 480 computados; trabalhado vale 549: 1 hora real = 69 min de folha
  assert.equal(d.saldoMin, 69);
  assert.deepEqual(d.extras, [{ percentualBp: 5000, minutos: 69 }]);
});

// ── Intervalo (art. 71) ─────────────────────────────────────────────────────

test("almoço de 30 min em jornada de 8h: 30 min de intervalo suprimido", () => {
  const d = util("08:00 12:00 12:30 17:00");
  assert.equal(d.trabalhadoMin, 510);
  assert.deepEqual(d.intervalo, { exigidoMin: 60, gozadoMin: 30, suprimidoMin: 30 });
  assert.deepEqual(d.ocorrencias, ["HORA_EXTRA", "INTERVALO_INSUFICIENTE"]);
});

test("6 horas seguidas sem pausa exigem 15 min de intervalo", () => {
  const seis = [{ inicio: hhmm("08:00"), fim: hhmm("14:00") }];
  const d = apurarDia({ tipoDia: "UTIL", previsto: seis, marcacoes: bat("08:00 14:00") }, R);
  assert.deepEqual(d.intervalo, { exigidoMin: 15, gozadoMin: 0, suprimidoMin: 15 });
});

test("4 horas seguidas não exigem intervalo", () => {
  const quatro = [{ inicio: hhmm("08:00"), fim: hhmm("12:00") }];
  const d = apurarDia({ tipoDia: "UTIL", previsto: quatro, marcacoes: bat("08:00 12:00") }, R);
  assert.equal(d.intervalo.exigidoMin, 0);
  assert.deepEqual(d.ocorrencias, []);
});

// ── Interjornada (art. 66) ──────────────────────────────────────────────────

test("saiu às 23:00 e voltou às 08:00: faltaram 2 horas de descanso", () => {
  const d = util("08:00 12:00 13:00 17:00", { ultimaSaidaAnterior: hhmm("23:00", -1) });
  assert.deepEqual(d.interjornada, { descansoMin: 540, faltanteMin: 120 });
  assert.ok(d.ocorrencias.includes("INTERJORNADA_INSUFICIENTE"));
});

test("saiu às 17:00 e voltou às 08:00: 15 horas de descanso, tudo certo", () => {
  const d = util("08:00 12:00 13:00 17:00", { ultimaSaidaAnterior: hhmm("17:00", -1) });
  assert.deepEqual(d.interjornada, { descansoMin: 900, faltanteMin: 0 });
  assert.deepEqual(d.ocorrencias, []);
});
