// Teste do cálculo de horário de atendimento. Puro, sem banco.
// Rodar com: npx tsx apps/worker/src/business-hours.test-manual.ts
import { agoraNoFuso, dentroDoHorario, type DiaDeAtendimento } from "./business-hours";

const SP = "America/Sao_Paulo";

// Seg a sex 08:00-18:00, sábado 08:00-12:00, domingo fechado.
const SEMANA: DiaDeAtendimento[] = [
  { weekday: 0, isOpen: false, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 1, isOpen: true, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 2, isOpen: true, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 3, isOpen: true, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 4, isOpen: true, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 5, isOpen: true, opensAt: "08:00", closesAt: "18:00" },
  { weekday: 6, isOpen: true, opensAt: "08:00", closesAt: "12:00" },
];

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// 2026-08-11 é terça-feira.
checa("terça 12:00 SP (15:00Z) — dentro", dentroDoHorario(SEMANA, SP, new Date("2026-08-11T15:00:00Z")), true);
checa("terça 07:59 SP (10:59Z) — antes de abrir", dentroDoHorario(SEMANA, SP, new Date("2026-08-11T10:59:00Z")), false);
checa("terça 08:00 SP (11:00Z) — abre exatamente", dentroDoHorario(SEMANA, SP, new Date("2026-08-11T11:00:00Z")), true);
checa("terça 17:59 SP (20:59Z) — último minuto", dentroDoHorario(SEMANA, SP, new Date("2026-08-11T20:59:00Z")), true);
checa("terça 18:00 SP (21:00Z) — fecha exatamente", dentroDoHorario(SEMANA, SP, new Date("2026-08-11T21:00:00Z")), false);

// O caso que quebra quem usa a data UTC: 02:00Z de terça ainda é SEGUNDA 23:00
// em São Paulo. Dia da semana e horário têm que sair da data local.
const viraDia = new Date("2026-08-11T02:00:00Z");
checa("virada de dia — weekday local é segunda (1)", agoraNoFuso(SP, viraDia).weekday, 1);
checa("virada de dia — 23:00 local", agoraNoFuso(SP, viraDia).minutos, 23 * 60);
checa("virada de dia — fora do horário", dentroDoHorario(SEMANA, SP, viraDia), false);

// Sábado 2026-08-15: meio período.
checa("sábado 10:00 SP — dentro", dentroDoHorario(SEMANA, SP, new Date("2026-08-15T13:00:00Z")), true);
checa("sábado 14:00 SP — fora", dentroDoHorario(SEMANA, SP, new Date("2026-08-15T17:00:00Z")), false);

// Domingo 2026-08-16: fechado o dia todo.
checa("domingo meio-dia — fechado", dentroDoHorario(SEMANA, SP, new Date("2026-08-16T15:00:00Z")), false);

// Configuração ausente ou ruim tem que cair pra "fora" — errar pra esse lado
// manda um aviso a mais; errar pro outro deixa o cliente sem resposta.
checa("semana vazia — fora", dentroDoHorario([], SP, new Date("2026-08-11T15:00:00Z")), false);
checa(
  "dia sem linha — fora",
  dentroDoHorario(SEMANA.filter((d) => d.weekday !== 2), SP, new Date("2026-08-11T15:00:00Z")),
  false
);
checa(
  "fecha antes de abrir — fora",
  dentroDoHorario([{ weekday: 2, isOpen: true, opensAt: "18:00", closesAt: "08:00" }], SP, new Date("2026-08-11T15:00:00Z")),
  false
);
checa(
  "horário malformado — fora",
  dentroDoHorario([{ weekday: 2, isOpen: true, opensAt: "8h", closesAt: "18:00" }], SP, new Date("2026-08-11T15:00:00Z")),
  false
);

// Meia-noite: o %24 do hour12:false.
checa("meia-noite local — 0 minutos", agoraNoFuso(SP, new Date("2026-08-11T03:00:00Z")).minutos, 0);

console.log(falhas === 0 ? "\nPASSOU" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
