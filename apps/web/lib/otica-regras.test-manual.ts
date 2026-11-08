// Regras da ótica: graus, medidas, etapas, prazos e avisos. Puro, sem banco.
// Rodar com: npx tsx apps/web/lib/otica-regras.test-manual.ts
import {
  alertasDaReceita,
  diaHoraNoFuso,
  instanteNoFuso,
  avisoDaEtapa,
  estaAtrasada,
  formatarDioptria,
  formatarEixo,
  formatarMilimetros,
  grausVazios,
  lerDioptria,
  lerEixo,
  lerMilimetros,
  montarAviso,
  normalizarGraus,
  numeroOS,
  podeMover,
  resumoFinanceiro,
  previsaoPeloPrazo,
  primeiroNome,
  proximaEtapa,
  saldoCents,
  temPerto,
  validadeDaReceita,
} from "./otica-regras";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}${ok ? "" : ` — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}
const valor = (r: ReturnType<typeof lerDioptria>) => (r.ok ? r.valor : "erro");

// Dioptria
checa("+2,00", valor(lerDioptria("+2,00")), 200);
checa("-0,50", valor(lerDioptria("-0,50")), -50);
checa("-0.5 com ponto e uma casa", valor(lerDioptria("-0.5")), -50);
checa("2 sem sinal é positivo", valor(lerDioptria("2")), 200);
checa("+1,75", valor(lerDioptria("+1,75")), 175);
checa("plano = 0", valor(lerDioptria("plano")), 0);
checa("vazio = null", valor(lerDioptria("  ")), null);
checa("+2,3 recusa (passo de 0,25)", valor(lerDioptria("+2,3")), "erro");
checa("letras recusam", valor(lerDioptria("abc")), "erro");
checa("fora da faixa recusa", valor(lerDioptria("+35,00")), "erro");
checa("formata +2,25", formatarDioptria(225), "+2,25");
checa("formata -0,50", formatarDioptria(-50), "-0,50");
checa("formata -1,25", formatarDioptria(-125), "-1,25");
checa("formata 0", formatarDioptria(0), "0,00");
checa("formata null", formatarDioptria(null), "");

// Eixo
checa("eixo 105°", valor(lerEixo("105°")), 105);
checa("eixo 85", valor(lerEixo("85")), 85);
checa("eixo 181 recusa", valor(lerEixo("181")), "erro");
checa("formata eixo", formatarEixo(85), "85°");

// Milímetros (DNP e altura)
checa("34,5", valor(lerMilimetros("34,5")), 345);
checa("34", valor(lerMilimetros("34")), 340);
checa("345 do talão vira 34,5", valor(lerMilimetros("345", 45)), 345);
checa("340 do talão vira 34,0", valor(lerMilimetros("340", 45)), 340);
checa("22,5 altura", valor(lerMilimetros("22,5", 45)), 225);
checa("medida absurda recusa", valor(lerMilimetros("99,0", 45)), "erro");
checa("formata 34,5", formatarMilimetros(345), "34,5");
checa("formata 22,0", formatarMilimetros(220), "22,0");

// Receita
const g = grausVazios();
checa("receita vazia sem perto", temPerto(g), false);
g.perto.od.esferico = 300;
checa("com grau de perto", temPerto(g), true);
const n = normalizarGraus({ longe: { od: { esferico: 200, cilindrico: -50, eixo: 105, dnp: 340, altura: 225 } }, adicao: { oe: 225 } });
checa("normaliza o que veio", n.longe.od, { esferico: 200, cilindrico: -50, eixo: 105, dnp: 340, altura: 225 });
checa("normaliza o que faltou", n.longe.oe, { esferico: null, cilindrico: null, eixo: null, dnp: null, altura: null });
checa("normaliza adição", n.adicao, { od: null, oe: 225 });
checa("descarta não inteiro", normalizarGraus({ longe: { od: { esferico: 2.25 } } }).longe.od.esferico, null);
const semEixo = grausVazios();
semEixo.longe.oe.cilindrico = -125;
checa("alerta cilíndrico sem eixo", alertasDaReceita(semEixo), ["Longe OE: cilíndrico sem eixo"]);
checa("sem alerta com eixo", alertasDaReceita(n), []);
checa("validade 1 ano", validadeDaReceita(new Date("2026-10-27T12:00:00Z"), 12).toISOString().slice(0, 10), "2027-10-27");
checa("validade 31/01 + 1 mês", validadeDaReceita(new Date("2026-01-31T12:00:00Z"), 1).toISOString().slice(0, 10), "2026-02-28");

// Etapas
checa("próxima de aberta", proximaEtapa("ABERTA"), "LABORATORIO");
checa("próxima de pronta", proximaEtapa("PRONTA"), "ENTREGUE");
checa("entregue não tem próxima", proximaEtapa("ENTREGUE"), null);
checa("pode voltar ao laboratório", podeMover("CONFERENCIA", "LABORATORIO"), true);
checa("cancelada não reabre", podeMover("CANCELADA", "ABERTA"), false);
checa("mesma etapa não move", podeMover("ABERTA", "ABERTA"), false);

// Prazo
const agora = new Date("2026-11-07T15:00:00Z");
checa("atrasada no laboratório", estaAtrasada("LABORATORIO", new Date("2026-11-05T12:00:00Z"), agora), true);
checa("pronta não está atrasada", estaAtrasada("PRONTA", new Date("2026-11-05T12:00:00Z"), agora), false);
checa("sem previsão não atrasa", estaAtrasada("LABORATORIO", null, agora), false);
checa("prazo de 7 dias", previsaoPeloPrazo(new Date("2026-11-02T12:00:00Z"), 7).toISOString().slice(0, 10), "2026-11-09");
checa("prazo que cai no domingo vai para segunda", previsaoPeloPrazo(new Date("2026-11-01T12:00:00Z"), 7).toISOString().slice(0, 10), "2026-11-09");
const SP = "America/Sao_Paulo";
checa("18/11 16h em Brasília é 19h UTC", instanteNoFuso("2026-11-18", "16:00", SP).toISOString(), "2026-11-18T19:00:00.000Z");
checa("sem hora é meia-noite de Brasília", instanteNoFuso("2026-11-14", "", SP).toISOString(), "2026-11-14T03:00:00.000Z");
checa("Manaus é uma hora atrás", instanteNoFuso("2026-11-18", "16:00", "America/Manaus").toISOString(), "2026-11-18T20:00:00.000Z");
checa("volta para dia e hora", diaHoraNoFuso(new Date("2026-11-18T19:00:00Z"), SP), { dia: "2026-11-18", hora: "16:00" });
checa("meia-noite volta sem hora", diaHoraNoFuso(new Date("2026-11-14T03:00:00Z"), SP), { dia: "2026-11-14", hora: "" });
checa("saldo", saldoCents(145000, 72500), 72500);
checa("saldo nunca negativo", saldoCents(100, 500), 0);

// Avisos
checa("aviso padrão de pronta ligado", avisoDaEtapa("PRONTA", null)?.ativo, true);
checa("aviso padrão de montagem desligado", avisoDaEtapa("MONTAGEM", {})?.ativo, false);
checa("loja desliga aviso", avisoDaEtapa("PRONTA", { PRONTA: { ativo: false } })?.ativo, false);
checa("texto vazio usa o padrão", avisoDaEtapa("PRONTA", { PRONTA: { ativo: true, texto: "  " } })?.texto.startsWith("Boa notícia"), true);
checa("etapa interna não avisa", avisoDaEtapa("CONFERENCIA", null), null);
checa("primeiro nome", primeiroNome("MARILENE MARIA RIBEIRO"), "Marilene");
const vars = { nome: "Marilene", os: numeroOS(499), previsao: "18/11 às 16h", saldoCents: 72500, loja: "Ótica Visuallis" };
const comSaldo = montarAviso(avisoDaEtapa("PRONTA", null)!.texto, vars);
checa("pronta com saldo cita o valor", comSaldo.includes("Saldo a pagar na retirada: R$"), true);
checa("pronta cita a OS", comSaldo.includes("OS 0499"), true);
const quitada = montarAviso(avisoDaEtapa("PRONTA", null)!.texto, { ...vars, saldoCents: 0 });
checa("pronta quitada não cobra", quitada.includes("Saldo"), false);
checa("sem previsão diz a combinar", montarAviso("Previsão: {previsao}", { ...vars, previsao: "" }), "Previsão: a combinar");
checa("número da OS com 4 dígitos", numeroOS(7), "0007");

// Conta a receber da OS
const dia = (d: string) => new Date(`${d}T12:00:00Z`);
const parc = (valor: number, venc: string, pagos: number[], extra: object = {}) => ({
  valorCents: valor, vencimento: dia(venc), canceladaEm: null, reembolsadaEm: null, pagamentos: pagos.map((v) => ({ valorCents: v })), ...extra,
});
const sinalESaldo = resumoFinanceiro([parc(10000, "2026-11-07", [10000]), parc(39000, "2026-11-14", [])]);
checa("sinal pago e saldo aberto", [sinalESaldo.devidoCents, sinalESaldo.recebidoCents, sinalESaldo.saldoCents, sinalESaldo.emAberto], [49000, 10000, 39000, 1]);
checa("próximo vencimento é o do saldo", sinalESaldo.proximoVencimento?.toISOString().slice(0, 10), "2026-11-14");
const contaQuitada = resumoFinanceiro([parc(10000, "2026-11-07", [10000]), parc(39000, "2026-11-14", [39000])]);
checa("quitada não tem saldo nem vencimento", [contaQuitada.saldoCents, contaQuitada.emAberto, contaQuitada.proximoVencimento], [0, 0, null]);
const parcelada = resumoFinanceiro([parc(10000, "2026-11-07", [10000]), parc(19500, "2026-12-14", [19500]), parc(19500, "2027-01-14", [])]);
checa("parcelada: falta a última", [parcelada.saldoCents, parcelada.emAberto], [19500, 1]);
checa("próximo vencimento da parcelada", parcelada.proximoVencimento?.toISOString().slice(0, 10), "2027-01-14");
const estornada = resumoFinanceiro([parc(10000, "2026-11-07", [10000, -10000])]);
checa("sinal estornado volta a dever", [estornada.recebidoCents, estornada.saldoCents], [0, 10000]);
const canceladaComSinal = resumoFinanceiro([parc(10000, "2026-11-07", [10000]), parc(39000, "2026-11-14", [], { canceladaEm: new Date() })]);
checa("cancelada: a loja fica com o sinal e não cobra o saldo", [canceladaComSinal.saldoCents, canceladaComSinal.recebidoCents], [0, 10000]);
const pagouAMais = resumoFinanceiro([parc(10000, "2026-11-07", [12000])]);
checa("recebeu a mais: saldo não fica negativo", pagouAMais.saldoCents, 0);
checa("sem parcelas", resumoFinanceiro([]).saldoCents, 0);

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
if (falhas) process.exit(1);
