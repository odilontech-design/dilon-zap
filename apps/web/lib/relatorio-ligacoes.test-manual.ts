// Relatório de ligações: feitas, taxa de atendimento, prazo, tentativas até o
// contato, por pessoa e por dia. Puro, sem banco. Dados fictícios.
// Rodar com: npx tsx apps/web/lib/relatorio-ligacoes.test-manual.ts
import { calcularLigacoes, diaBR, type LigacaoIn } from "./relatorio-ligacoes";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}

const AGORA = new Date("2026-10-15T15:00:00Z");
const d = (iso: string) => new Date(iso);

let seq = 0;
function lig(p: Partial<LigacaoIn> = {}): LigacaoIn {
  seq++;
  return {
    id: `t${seq}`,
    negociacaoId: `n${seq}`,
    responsavelId: "ana",
    venceEm: d("2026-10-10T12:00:00Z"), // 09h em Brasília
    concluidaEm: d("2026-10-10T14:00:00Z"),
    resultado: "ATENDEU",
    ...p,
  };
}

const PERIODO = { desde: d("2026-10-01T03:00:00Z"), ate: d("2026-10-31T23:59:59Z") };

// ------------------------------------------------------------------ dia BR
checa("22h30 do dia 30 em Brasília ainda é dia 30", diaBR(d("2026-10-01T01:30:00Z")), "2026-09-30");

// --------------------------------------------------- resultados e taxa
{
  const r = calcularLigacoes({
    ligacoes: [
      lig({ resultado: "ATENDEU" }),
      lig({ resultado: "ATENDEU" }),
      lig({ resultado: "NAO_ATENDEU" }),
      lig({ resultado: "RECADO" }),
      lig({ resultado: "NUMERO_INVALIDO" }),
    ],
    ...PERIODO,
    agora: AGORA,
  });
  checa("feitas no período", r.feitas, 5);
  checa("contagem por resultado", [r.porResultado.ATENDEU, r.porResultado.NAO_ATENDEU, r.porResultado.RECADO, r.porResultado.NUMERO_INVALIDO], [2, 1, 1, 1]);
  checa("taxa de atendimento ignora número inválido", r.taxaAtendimento, 2 / 4);
}

// ------------------------------------------------------ período por conclusão
{
  const r = calcularLigacoes({
    ligacoes: [lig({ concluidaEm: d("2026-09-20T14:00:00Z"), venceEm: d("2026-09-20T12:00:00Z") }), lig()],
    ...PERIODO,
    agora: AGORA,
  });
  checa("ligação concluída fora do período não conta", r.feitas, 1);
}

// ---------------------------------------------------------------- no prazo
{
  const r = calcularLigacoes({
    ligacoes: [
      lig({ venceEm: d("2026-10-10T12:00:00Z"), concluidaEm: d("2026-10-10T20:00:00Z") }), // 17h do mesmo dia: no prazo
      lig({ venceEm: d("2026-10-10T12:00:00Z"), concluidaEm: d("2026-10-12T14:00:00Z") }), // dois dias depois: fora
    ],
    ...PERIODO,
    agora: AGORA,
  });
  checa("feita no mesmo dia, mesmo depois da hora marcada, está no prazo", r.taxaNoPrazo, 1 / 2);
}

// ----------------------------------------------------- pendentes atrasadas
{
  const r = calcularLigacoes({
    ligacoes: [
      lig({ concluidaEm: null, resultado: null, venceEm: d("2026-10-14T12:00:00Z") }), // atrasada
      lig({ concluidaEm: null, resultado: null, venceEm: d("2026-10-20T12:00:00Z") }), // ainda no futuro
    ],
    ...PERIODO,
    agora: AGORA,
  });
  checa("só pendente já vencida é atrasada", r.pendentesAtrasadas, 1);
  checa("pendente não conta como feita", r.feitas, 0);
  checa("sem ligação feita a taxa é nula, não zero", r.taxaAtendimento, null);
}

// ------------------------------------------- tentativas até o primeiro contato
{
  const n = "neg-a";
  const r = calcularLigacoes({
    ligacoes: [
      lig({ negociacaoId: n, resultado: "NAO_ATENDEU", concluidaEm: d("2026-10-05T14:00:00Z") }),
      lig({ negociacaoId: n, resultado: "RECADO", concluidaEm: d("2026-10-06T14:00:00Z") }),
      lig({ negociacaoId: n, resultado: "ATENDEU", concluidaEm: d("2026-10-07T14:00:00Z") }),
      lig({ negociacaoId: n, resultado: "ATENDEU", concluidaEm: d("2026-10-09T14:00:00Z") }), // depois do 1º contato: não conta de novo
      lig({ negociacaoId: "neg-b", resultado: "ATENDEU", concluidaEm: d("2026-10-05T14:00:00Z") }),
    ],
    ...PERIODO,
    agora: AGORA,
  });
  checa("média de tentativas até o contato", r.tentativasMedias, (3 + 1) / 2);
  checa("distribuição", r.distribuicaoTentativas.map((x) => x.negociacoes), [1, 0, 1, 0, 0]);
}

// ---------------------- contato que nunca aconteceu não entra nas tentativas
{
  const r = calcularLigacoes({
    ligacoes: [lig({ resultado: "NAO_ATENDEU" }), lig({ resultado: "NAO_ATENDEU" })],
    ...PERIODO,
    agora: AGORA,
  });
  checa("sem nenhum atendimento, tentativas médias é nulo", r.tentativasMedias, null);
}

// -------------------- primeiro contato antes do período não conta no período
{
  const n = "neg-c";
  const r = calcularLigacoes({
    ligacoes: [
      lig({ negociacaoId: n, resultado: "ATENDEU", concluidaEm: d("2026-09-10T14:00:00Z"), venceEm: d("2026-09-10T12:00:00Z") }),
      lig({ negociacaoId: n, resultado: "ATENDEU", concluidaEm: d("2026-10-10T14:00:00Z") }),
    ],
    ...PERIODO,
    agora: AGORA,
  });
  checa("o primeiro contato foi em setembro: não entra nas tentativas de outubro", r.tentativasMedias, null);
}

// ------------------------------------------------------------- por pessoa
{
  const r = calcularLigacoes({
    ligacoes: [
      lig({ responsavelId: "ana", resultado: "ATENDEU" }),
      lig({ responsavelId: "ana", resultado: "NAO_ATENDEU" }),
      lig({ responsavelId: "bia", resultado: "ATENDEU" }),
      lig({ responsavelId: "bia", concluidaEm: null, resultado: null, venceEm: d("2026-10-14T12:00:00Z") }),
    ],
    ...PERIODO,
    agora: AGORA,
  });
  const ana = r.porPessoa.find((p) => p.responsavelId === "ana")!;
  const bia = r.porPessoa.find((p) => p.responsavelId === "bia")!;
  checa("Ana: feitas e taxa", [ana.feitas, ana.taxaAtendimento], [2, 0.5]);
  checa("Bia: feita, taxa cheia e uma atrasada", [bia.feitas, bia.taxaAtendimento, bia.atrasadas], [1, 1, 1]);
}

// ---------------------------------------------------------- filtro por pessoa
{
  const r = calcularLigacoes({
    ligacoes: [lig({ responsavelId: "ana" }), lig({ responsavelId: "bia" }), lig({ responsavelId: null })],
    ...PERIODO,
    responsavelId: "ana",
    agora: AGORA,
  });
  checa("filtrar por pessoa", r.feitas, 1);
  const sem = calcularLigacoes({ ligacoes: [lig({ responsavelId: "ana" }), lig({ responsavelId: null })], ...PERIODO, responsavelId: "sem", agora: AGORA });
  checa("filtrar por sem responsável", sem.feitas, 1);
}

// ------------------------------------------------------------------ por dia
{
  const r = calcularLigacoes({
    ligacoes: [
      lig({ concluidaEm: d("2026-10-10T14:00:00Z") }),
      lig({ concluidaEm: d("2026-10-10T15:00:00Z"), resultado: "NAO_ATENDEU" }),
      lig({ concluidaEm: d("2026-10-08T14:00:00Z") }),
    ],
    ...PERIODO,
    agora: AGORA,
  });
  checa("série por dia, em ordem", r.porDia, [
    { dia: "2026-10-08", feitas: 1, atendeu: 1 },
    { dia: "2026-10-10", feitas: 2, atendeu: 1 },
  ]);
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
