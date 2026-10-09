// Indicadores do funil: conversão por coorte, ganho, ticket, ciclo, previsão e
// negócios parados. Puro, sem banco. Dados fictícios.
// Rodar com: npx tsx apps/web/lib/funil-indicadores.test-manual.ts
import {
  calcularIndicadores,
  filtrarNegociacoes,
  diasEntre,
  formatarTaxa,
  type NegociacaoIn,
  type EventoIn,
  type EtapaIn,
} from "./funil-indicadores";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}

const AGORA = new Date("2026-10-15T12:00:00Z");
const dia = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);

const ETAPAS: EtapaIn[] = [
  { id: "lead", nome: "Lead", position: 0, probabilidade: 10 },
  { id: "qual", nome: "Qualificado", position: 1, probabilidade: 30 },
  { id: "prop", nome: "Proposta", position: 2, probabilidade: 60 },
];

let seq = 0;
function neg(p: Partial<NegociacaoIn> = {}): NegociacaoIn {
  seq++;
  return {
    id: `n${seq}`,
    funilId: "f1",
    stageId: "lead",
    status: "ABERTA",
    valorCents: 100_00,
    recorrencia: "UNICA",
    responsavelId: null,
    origem: null,
    motivoPerdaId: null,
    previsaoFechamento: null,
    etapaDesde: dia(1),
    createdAt: dia(10),
    fechadaEm: null,
    ...p,
  };
}

/** Eventos de uma negociação que passou pelas etapas dadas, em ordem. */
function passou(n: NegociacaoIn, etapas: string[]): EventoIn[] {
  return etapas.map((e, i) => ({
    negociacaoId: n.id,
    tipo: i === 0 ? ("CRIADA" as const) : ("ETAPA" as const),
    paraStageId: e,
    em: dia(10 - i),
  }));
}

// ----------------------------------------------------------- funil vazio
const vazio = calcularIndicadores({ negociacoes: [], eventos: [], etapas: ETAPAS, agora: AGORA });
checa("funil vazio: totais zerados", [vazio.total, vazio.abertas, vazio.ganhas, vazio.perdidas], [0, 0, 0, 0]);
// Taxa de ganho sem nenhuma decidida é "não sei", não zero: 0% afirma que tudo
// foi perdido.
checa("funil vazio: taxa de ganho é null, não 0", vazio.taxaDeGanho, null);
checa("funil vazio: ticket e ciclo são null", [vazio.ticketMedioCents, vazio.cicloMedioDias], [null, null]);
checa("funil vazio: ainda lista as etapas", vazio.porEtapa.length, 3);

// ----------------------------------------------------------- ganho e perda
const g1 = neg({ status: "GANHA", valorCents: 1000_00, createdAt: dia(20), fechadaEm: dia(10) });
const g2 = neg({ status: "GANHA", valorCents: 500_00, createdAt: dia(30), fechadaEm: dia(10) });
const p1 = neg({ status: "PERDIDA", valorCents: 200_00, motivoPerdaId: "preco", fechadaEm: dia(5) });
const p2 = neg({ status: "PERDIDA", valorCents: 300_00, motivoPerdaId: "preco", fechadaEm: dia(4) });
const p3 = neg({ status: "PERDIDA", valorCents: 100_00, motivoPerdaId: null, fechadaEm: dia(3) });
const base = calcularIndicadores({
  negociacoes: [g1, g2, p1, p2, p3],
  eventos: [],
  etapas: ETAPAS,
  agora: AGORA,
});
checa("taxa de ganho = ganhas / decididas", base.taxaDeGanho, 2 / 5);
checa("valor ganho", base.valorGanhoCents, 1500_00);
checa("ticket médio das ganhas", base.ticketMedioCents, 750_00);
// g1: 10 dias, g2: 20 dias → média 15.
checa("ciclo médio em dias", base.cicloMedioDias, 15);
checa(
  "perdas agrupadas por motivo, maior primeiro",
  base.perdasPorMotivo,
  [
    { motivoId: "preco", quantidade: 2, valorCents: 500_00 },
    { motivoId: null, quantidade: 1, valorCents: 100_00 },
  ]
);

// Negociação aberta NÃO entra na taxa de ganho: ela ainda não foi decidida.
const comAbertas = calcularIndicadores({
  negociacoes: [g1, p1, neg(), neg(), neg()],
  eventos: [],
  etapas: ETAPAS,
  agora: AGORA,
});
checa("abertas não diluem a taxa de ganho", comAbertas.taxaDeGanho, 1 / 2);

// Ganha sem data de fechamento é dado incompleto: contar como zero dias
// puxaria o ciclo médio pra baixo.
const semFechada = calcularIndicadores({
  negociacoes: [g1, neg({ status: "GANHA", createdAt: dia(40), fechadaEm: null })],
  eventos: [],
  etapas: ETAPAS,
  agora: AGORA,
});
checa("ganha sem fechadaEm não entra no ciclo", semFechada.cicloMedioDias, 10);

// ----------------------------------------------------------- recorrência e MRR
const mrr = calcularIndicadores({
  negociacoes: [
    neg({ status: "GANHA", valorCents: 350_00, recorrencia: "MENSAL", fechadaEm: dia(1) }),
    neg({ status: "GANHA", valorCents: 350_00, recorrencia: "MENSAL", fechadaEm: dia(2) }),
    neg({ status: "GANHA", valorCents: 5000_00, recorrencia: "UNICA", fechadaEm: dia(3) }),
    neg({ status: "ABERTA", valorCents: 350_00, recorrencia: "MENSAL" }),
  ],
  eventos: [],
  etapas: ETAPAS,
  agora: AGORA,
});
// Só ganha mensal é receita recorrente: a venda única de 5 mil não é MRR, e a
// mensal ainda aberta não é receita nenhuma.
checa("novo MRR soma só ganhas mensais", mrr.novoMrrCents, 700_00);
checa("valor ganho soma recorrente e única", mrr.valorGanhoCents, 5700_00);

// ----------------------------------------------------------- previsão ponderada
const prev = calcularIndicadores({
  negociacoes: [
    neg({ stageId: "lead", valorCents: 1000_00 }), // 10% = 100
    neg({ stageId: "qual", valorCents: 1000_00 }), // 30% = 300
    neg({ stageId: "prop", valorCents: 1000_00 }), // 60% = 600
    neg({ stageId: "prop", status: "GANHA", valorCents: 9999_00, fechadaEm: dia(1) }), // fechada: fora
  ],
  eventos: [],
  etapas: ETAPAS,
  agora: AGORA,
});
checa("previsão = valor × probabilidade da etapa, só das abertas", prev.previsaoPonderadaCents, 1000_00);
checa(
  "etapa sem probabilidade conhecida vale zero na previsão",
  calcularIndicadores({
    negociacoes: [neg({ stageId: "etapa-apagada", valorCents: 1000_00 })],
    eventos: [],
    etapas: ETAPAS,
    agora: AGORA,
  }).previsaoPonderadaCents,
  0
);

// ----------------------------------------------------------- negócios parados
const parados = calcularIndicadores({
  negociacoes: [
    neg({ etapaDesde: dia(30) }), // parada
    neg({ etapaDesde: dia(15) }), // parada (>14)
    neg({ etapaDesde: dia(14) }), // exatamente 14: ainda não
    neg({ etapaDesde: dia(2) }),
    neg({ status: "GANHA", etapaDesde: dia(90), fechadaEm: dia(1) }), // fechada não esfria
  ],
  eventos: [],
  etapas: ETAPAS,
  agora: AGORA,
});
checa("parada = aberta há mais de 14 dias na mesma etapa", parados.paradas, 2);
checa(
  "o limite é configurável",
  calcularIndicadores({
    negociacoes: [neg({ etapaDesde: dia(8) })],
    eventos: [],
    etapas: ETAPAS,
    agora: AGORA,
    diasParada: 7,
  }).paradas,
  1
);

// ----------------------------------------------------------- conversão por coorte
// 10 negociações. 10 chegaram a Lead; 6 a Qualificado; 3 a Proposta.
const coorte: NegociacaoIn[] = [];
const evs: EventoIn[] = [];
for (let i = 0; i < 10; i++) {
  const caminho = i < 3 ? ["lead", "qual", "prop"] : i < 6 ? ["lead", "qual"] : ["lead"];
  const n = neg({ stageId: caminho[caminho.length - 1] });
  coorte.push(n);
  evs.push(...passou(n, caminho));
}
const c = calcularIndicadores({ negociacoes: coorte, eventos: evs, etapas: ETAPAS, agora: AGORA });
checa("chegaram em cada etapa", c.porEtapa.map((l) => l.chegaram), [10, 6, 3]);
checa("taxa da anterior: onde o funil vaza", c.porEtapa.map((l) => l.taxaDaAnterior), [null, 0.6, 0.5]);
checa("taxa desde o início: funil acumulado", c.porEtapa.map((l) => l.taxaDesdeOInicio), [null, 0.6, 0.3]);

// O ponto central do método: quem foi à proposta e VOLTOU à qualificação
// passou pela proposta. Olhar só a etapa atual esconderia isso.
const voltou = neg({ stageId: "qual" });
const cv = calcularIndicadores({
  negociacoes: [voltou],
  eventos: passou(voltou, ["lead", "qual", "prop", "qual"]),
  etapas: ETAPAS,
  agora: AGORA,
});
checa("negociação que voltou ainda conta na etapa que alcançou", cv.porEtapa.map((l) => l.chegaram), [1, 1, 1]);
checa("mas as abertas agora estão só onde ela está", cv.porEtapa.map((l) => l.abertasAgora), [0, 1, 0]);

// Sem histórico (migrada), cai na etapa atual em vez de sumir do funil.
const migrada = neg({ stageId: "qual" });
checa(
  "sem eventos, conta ao menos na etapa atual",
  calcularIndicadores({ negociacoes: [migrada], eventos: [], etapas: ETAPAS, agora: AGORA }).porEtapa.map(
    (l) => l.chegaram
  ),
  [0, 1, 0]
);

// A taxa nunca passa de 100%: uma etapa pulada pelo histórico não infla a próxima.
checa("taxas ficam entre 0 e 1", c.porEtapa.every((l) => (l.taxaDaAnterior ?? 0) <= 1), true);

// Etapa anterior sem ninguém: divisão por zero vira null, não Infinity ou NaN.
const semAnterior = neg({ stageId: "prop" });
const sa = calcularIndicadores({
  negociacoes: [semAnterior],
  eventos: [{ negociacaoId: semAnterior.id, tipo: "CRIADA", paraStageId: "prop", em: dia(1) }],
  etapas: ETAPAS,
  agora: AGORA,
});
checa("divisão por zero não vaza NaN nem Infinity", sa.porEtapa.map((l) => l.taxaDaAnterior), [null, null, null]);

// ----------------------------------------------------------- valor por etapa
const vl = calcularIndicadores({
  negociacoes: [
    neg({ stageId: "lead", valorCents: 100_00 }),
    neg({ stageId: "lead", valorCents: 250_00 }),
    neg({ stageId: "qual", valorCents: 400_00 }),
    neg({ stageId: "lead", status: "PERDIDA", valorCents: 9000_00, fechadaEm: dia(1) }),
  ],
  eventos: [],
  etapas: ETAPAS,
  agora: AGORA,
});
checa("valor aberto por etapa ignora as fechadas", vl.porEtapa.map((l) => l.valorAbertasCents), [350_00, 400_00, 0]);
checa("valor aberto total", vl.valorAbertoCents, 750_00);

// ----------------------------------------------------------- filtros
const lista = [
  neg({ funilId: "f1", responsavelId: "ana", origem: "Instagram", createdAt: dia(5) }),
  neg({ funilId: "f1", responsavelId: "bia", origem: "Indicação", createdAt: dia(20) }),
  neg({ funilId: "f2", responsavelId: null, origem: null, createdAt: dia(40) }),
];
checa("filtro por funil", filtrarNegociacoes(lista, { funilId: "f1" }).length, 2);
checa("filtro por responsável", filtrarNegociacoes(lista, { responsavelId: "ana" }).length, 1);
checa("filtro 'sem responsável'", filtrarNegociacoes(lista, { responsavelId: "sem" }).length, 1);
checa("filtro por origem", filtrarNegociacoes(lista, { origem: "Indicação" }).length, 1);
checa("filtro por período de criação", filtrarNegociacoes(lista, { desde: dia(25), ate: dia(1) }).length, 2);
checa("filtros se combinam", filtrarNegociacoes(lista, { funilId: "f1", responsavelId: "bia" }).length, 1);
checa("sem filtro devolve tudo", filtrarNegociacoes(lista, {}).length, 3);

// ----------------------------------------------------------- utilitários
checa("diasEntre conta dias inteiros", diasEntre(dia(3), AGORA), 3);
checa("diasEntre nunca é negativo", diasEntre(AGORA, dia(3)), 0);
checa("taxa nula vira traço", formatarTaxa(null), "—");
checa("taxa alta sem casa decimal", formatarTaxa(0.2133), "21%");
checa("taxa baixa com uma casa", formatarTaxa(0.0075), "0,8%");
checa("100%", formatarTaxa(1), "100%");
checa("zero", formatarTaxa(0), "0%");

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
