// Relatório de origem dos leads: agrupamento, coorte, conversão e valor por
// origem. Puro, sem banco. Dados fictícios.
// Rodar com: npx tsx apps/web/lib/relatorio-origem.test-manual.ts
import { calcularPorOrigem, chaveDaOrigem, SEM_ORIGEM } from "./relatorio-origem";
import type { EventoIn, NegociacaoIn } from "./funil-indicadores";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}

let seq = 0;
function neg(p: Partial<NegociacaoIn> = {}): NegociacaoIn {
  seq++;
  const n: NegociacaoIn = {
    id: `n${seq}`,
    funilId: "f1",
    stageId: "lead",
    status: "ABERTA",
    valorCents: 0,
    recorrencia: "UNICA",
    valorMensalCents: 0,
    responsavelId: null,
    origem: null,
    motivoPerdaId: null,
    previsaoFechamento: null,
    etapaDesde: new Date("2026-10-01T12:00:00Z"),
    createdAt: new Date("2026-10-05T12:00:00Z"),
    fechadaEm: null,
    ...p,
  };
  return { ...n, valorMensalCents: p.valorMensalCents ?? (n.recorrencia === "MENSAL" ? n.valorCents : 0) };
}

const ganha = (origem: string | null, valor: number, extra: Partial<NegociacaoIn> = {}) =>
  neg({ origem, status: "GANHA", valorCents: valor, fechadaEm: new Date("2026-10-15T12:00:00Z"), ...extra });

// ------------------------------------------------------------------- chave
checa("chave ignora maiúsculas, acento e espaços", chaveDaOrigem("  Indicação  "), "indicacao");
checa("vazio vira chave vazia", chaveDaOrigem("   "), "");
checa("nulo vira chave vazia", chaveDaOrigem(null), "");

// -------------------------------------------------------------- agrupamento
{
  const r = calcularPorOrigem({
    negociacoes: [neg({ origem: "Instagram" }), neg({ origem: "instagram" }), neg({ origem: " Instagram " }), neg({ origem: "Indicação" }), neg({ origem: null })],
    eventos: [],
    etapaSqlId: null,
  });
  checa("variações de grafia viram uma origem só", r.linhas.find((l) => l.origem === "Instagram")?.leads, 3);
  checa("mostra a grafia mais usada", r.linhas[0].origem, "Instagram");
  checa("sem origem aparece como linha própria", r.linhas.some((l) => l.origem === SEM_ORIGEM && l.leads === 1), true);
  checa("participação soma a base", r.linhas.reduce((s, l) => s + l.participacao, 0), 1);
}

// --------------------------------------------------- conversão e valor
{
  const r = calcularPorOrigem({
    negociacoes: [
      ganha("Site", 1000_00),
      ganha("Site", 3000_00),
      neg({ origem: "Site", status: "PERDIDA", fechadaEm: new Date("2026-10-20T12:00:00Z") }),
      neg({ origem: "Site" }),
      ganha("Anúncio", 500_00),
      neg({ origem: "Anúncio", status: "PERDIDA" }),
      neg({ origem: "Anúncio", status: "PERDIDA" }),
    ],
    eventos: [],
    etapaSqlId: null,
  });
  const site = r.linhas.find((l) => l.origem === "Site")!;
  checa("Site: leads, ganhas, perdidas, abertas", [site.leads, site.ganhas, site.perdidas, site.abertas], [4, 2, 1, 1]);
  checa("taxa de ganho = ganhas / decididas", site.taxaDeGanho, 2 / 3);
  checa("lead → cliente = ganhas / leads", site.conversaoLeadCliente, 2 / 4);
  checa("valor ganho e ticket", [site.valorGanhoCents, site.ticketMedioCents], [4000_00, 2000_00]);
  checa("ciclo médio em dias (5/10 → 15/10)", site.cicloMedioDias, 10);
  const anuncio = r.linhas.find((l) => l.origem === "Anúncio")!;
  checa("Anúncio converte menos", anuncio.taxaDeGanho, 1 / 3);
  checa("totais", [r.total.leads, r.total.ganhas, r.total.valorGanhoCents], [7, 3, 4500_00]);
  checa("ordenado por volume", r.linhas.map((l) => l.origem), ["Site", "Anúncio"]);
}

// ----------------------------------------------------------- MRR por origem
{
  const r = calcularPorOrigem({
    negociacoes: [ganha("Parceiro", 1500_00, { recorrencia: "MENSAL", valorMensalCents: 500_00 })],
    eventos: [],
    etapaSqlId: null,
  });
  checa("MRR é só a parte mensal", r.linhas[0].novoMrrCents, 500_00);
  checa("valor ganho é o total", r.linhas[0].valorGanhoCents, 1500_00);
}

// ------------------------------------------------------------- SQL pelo histórico
{
  const a = neg({ origem: "Site", stageId: "lead" }); // passou pela SQL e voltou
  const b = neg({ origem: "Site", stageId: "lead" }); // nunca passou
  const c = neg({ origem: "Site", stageId: "sql" }); // está na SQL
  const eventos: EventoIn[] = [
    { negociacaoId: a.id, tipo: "CRIADA", paraStageId: "lead", em: new Date("2026-10-05T12:00:00Z") },
    { negociacaoId: a.id, tipo: "ETAPA", paraStageId: "sql", em: new Date("2026-10-06T12:00:00Z") },
    { negociacaoId: a.id, tipo: "ETAPA", paraStageId: "lead", em: new Date("2026-10-07T12:00:00Z") },
  ];
  const r = calcularPorOrigem({ negociacoes: [a, b, c], eventos, etapaSqlId: "sql" });
  checa("SQLs contam quem passou pela etapa, mesmo que tenha voltado", r.linhas[0].sqls, 2);
}

// ------------------------------------------------------ coorte pela criação
{
  const r = calcularPorOrigem({
    negociacoes: [
      neg({ origem: "Site", createdAt: new Date("2026-09-10T12:00:00Z") }),
      neg({ origem: "Site", createdAt: new Date("2026-10-10T12:00:00Z") }),
    ],
    eventos: [],
    etapaSqlId: null,
    desde: new Date("2026-10-01T03:00:00Z"),
  });
  checa("período filtra pela data de criação", r.total.leads, 1);
}

// -------------------------------------------------------------------- vazio
{
  const r = calcularPorOrigem({ negociacoes: [], eventos: [], etapaSqlId: null });
  checa("sem negociações", [r.linhas.length, r.total.leads, r.total.conversaoLeadCliente], [0, 0, null]);
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
