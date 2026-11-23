// Datas suspeitas das OS do papel: detecção por vizinhança, sugestões e aviso na leitura.
// Rodar com: npx tsx apps/web/lib/otica-datas.test-manual.ts
import assert from "node:assert/strict";
import { avisoDeDataNaLeitura, detectarDatasSuspeitas, type OSParaConferir } from "./otica-datas";

const d = (s: string) => new Date(`${s}T15:00:00Z`);
const os = (numero: number, data: string): OSParaConferir => ({ id: `os${numero}`, numero, data: d(data) });

// O talão real da Visuallis (resumido): tudo em março e abril de 2025, com cinco datas lidas errado.
const talao: OSParaConferir[] = [
  os(1, "2025-03-13"), os(2, "2025-03-19"), os(3, "2025-03-08"), os(4, "2025-03-08"), os(5, "2025-03-10"),
  os(6, "2025-03-10"), os(8, "2025-03-12"), os(9, "2025-03-13"), os(10, "2025-03-12"), os(11, "2025-03-30"),
  os(12, "2025-04-04"), os(13, "2025-03-14"), os(14, "2025-03-16"), os(15, "2025-03-17"), os(16, "2025-03-24"),
  os(17, "2025-03-18"), os(18, "2025-03-18"), os(19, "2025-03-19"), os(20, "2025-03-20"), os(21, "2025-03-20"),
  os(22, "2025-03-22"), os(23, "2025-03-22"),
  os(24, "2026-10-07"), // ano e mês errados
  os(25, "2025-03-22"), os(26, "2025-03-22"), os(27, "2025-03-24"), os(29, "2025-03-25"), os(30, "2025-04-04"),
  os(31, "2025-03-31"), os(32, "2025-04-01"), os(33, "2025-04-05"), os(34, "2025-04-07"), os(35, "2025-04-07"),
  os(36, "2025-04-08"), os(37, "2025-04-09"), os(38, "2025-04-09"),
  os(39, "2015-04-09"), // ano 2015 em vez de 2025
  os(40, "2025-04-09"), os(41, "2025-04-12"), os(42, "2025-04-12"), os(45, "2025-04-12"), os(46, "2025-04-14"),
  os(47, "2025-04-17"), os(48, "2025-04-12"), os(49, "2025-04-12"), os(50, "2025-04-12"), os(51, "2025-04-12"),
  os(52, "2025-04-12"), os(53, "2025-04-12"), os(54, "2025-04-12"),
  os(55, "2025-01-12"), // mês 01 em vez de 04
  os(56, "2025-04-14"), os(58, "2025-04-26"), os(59, "2025-04-15"),
  os(60, "2025-09-16"), // mês 09 em vez de 04
  os(61, "2025-04-16"), os(62, "2025-04-16"), os(63, "2025-04-17"), os(65, "2025-04-19"), os(66, "2025-04-24"),
  os(67, "2025-04-24"),
  os(68, "2015-04-21"), // ano 2015 em vez de 2025
  os(69, "2025-04-24"), os(70, "2025-04-24"), os(71, "2025-04-26"), os(77, "2025-04-30"), os(78, "2025-04-30"),
  os(80, "2020-01-30"), // ano e mês errados, na ponta do talão
];

const achadas = detectarDatasSuspeitas(talao);
const numeros = [...achadas.keys()].map((id) => Number(id.slice(2))).sort((a, b) => a - b);
assert.deepEqual(numeros, [24, 39, 55, 60, 68, 80], "acha exatamente as seis datas erradas, sem acusar OS certa");

// Sugestões: ano trocado, ou mês trocado.
assert.deepEqual(achadas.get("os68")!.sugestoes, ["2025-04-21"], "2015 → 2025, mesmo dia e mês");
assert.deepEqual(achadas.get("os39")!.sugestoes, ["2025-04-09"]);
assert.deepEqual(achadas.get("os55")!.sugestoes, ["2025-04-12"], "mês 01 → 04, mesmo dia");
assert.deepEqual(achadas.get("os60")!.sugestoes, ["2025-04-16"], "mês 09 → 04, mesmo dia");
assert.ok(achadas.get("os24")!.sugestoes.every((s) => s.startsWith("2025-03")), "sugere março de 2025, onde a sequência está");
assert.ok(achadas.get("os80")!.sugestoes.includes("2025-04-30"), "OS na ponta do talão também é conferida");

// Poucas OS: não há vizinhança para comparar, então não acusa nada.
assert.equal(detectarDatasSuspeitas([os(1, "2025-03-01"), os(2, "2015-03-01")]).size, 0);
assert.equal(detectarDatasSuspeitas([]).size, 0);

// Talão que atravessa o ano não vira suspeito só por mudar de ano.
const virada = [os(1, "2025-12-10"), os(2, "2025-12-20"), os(3, "2026-01-05"), os(4, "2026-01-12"), os(5, "2026-01-20"), os(6, "2026-02-01")];
assert.equal(detectarDatasSuspeitas(virada).size, 0, "virada de ano normal não é erro");

// Dia que não existe no calendário não vira sugestão: 30/01 lido errado, vizinhas em fevereiro.
// Trocar só o ano dá 2025-01-30 (existe); trocar ano e mês daria 2025-02-30, que não existe e fica de fora.
const fev = [os(1, "2025-02-05"), os(2, "2025-02-06"), os(3, "2025-02-07"), os(4, "2015-01-30"), os(5, "2025-02-08"), os(6, "2025-02-09"), os(7, "2025-02-10")];
assert.deepEqual(detectarDatasSuspeitas(fev).get("os4")!.sugestoes, ["2025-01-30"]);

// Aviso na leitura (sem vizinhas): futuro e muito antigo.
const hoje = new Date("2026-11-23T12:00:00Z");
assert.equal(avisoDeDataNaLeitura("2026-11-20", hoje), null);
assert.equal(avisoDeDataNaLeitura("2025-04-12", hoje), null);
assert.match(avisoDeDataNaLeitura("2026-12-04", hoje)!, /futuro/);
assert.match(avisoDeDataNaLeitura("2015-04-09", hoje)!, /mais de 3 anos \(2015\)/);
assert.equal(avisoDeDataNaLeitura("", hoje), null, "sem data lida não avisa");

console.log("otica-datas: ok");
