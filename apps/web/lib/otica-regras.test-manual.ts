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
  lerListaDeArmacoes,
  lerReais,
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

// Lista de armações colada de planilha
checa("reais com R$ e milhar", lerReais("R$ 1.250,00"), 125000);
checa("reais com ponto decimal", lerReais("85.5"), 8550);
checa("reais vazio é null", lerReais(" "), null);
checa("reais lixo é undefined", lerReais("caro"), undefined);
const tab = lerListaDeArmacoes("Código\tModelo\tMarca\tCor\tMedidas\tCusto\tPreço\tQtd\nA001\tAcetato redonda\tTopRay\tPreta\t52□19-145\tR$ 85,00\tR$ 290,00\t1\nA002\tMetal aviador\t\tDourada\t54□17-140\t72\t260\t2");
checa("cabeçalho com acento e tabulação", [tab.separador, tab.linhas.length, tab.erros.length], ["\t", 2, 0]);
checa("lê preço, custo e quantidade", [tab.linhas[0].custoCents, tab.linhas[0].precoCents, tab.linhas[0].quantidade], [8500, 29000, 1]);
checa("lê medidas com □", tab.linhas[0].medidas, "52□19-145");
checa("campo vazio vira null", tab.linhas[1].marca, null);
const semCab = lerListaDeArmacoes("B001;Nylon fio;Ray;Azul;Nylon;50□18-140;60;200;1");
checa("sem cabeçalho usa a ordem padrão", [semCab.separador, semCab.linhas[0].codigo, semCab.linhas[0].precoCents], [";", "B001", 20000]);
const ruim = lerListaDeArmacoes("Código;Modelo;Preço\nC1;Boa;100\n;Sem código;50\nC3;;50\nC1;Repetida;80\nC5;Preço ruim;caro\nC6;Boa 2;90");
checa("linhas boas passam e as ruins viram erro", [ruim.linhas.map((x) => x.codigo), ruim.erros.length], [["C1", "C6"], 4]);
checa("erro traz o número da linha", ruim.erros.map((e) => e.linha), [3, 4, 5, 6]);
checa("quantidade ausente vale 1", ruim.linhas[0].quantidade, 1);
checa("quantidade zero é aceita (já vendida)", lerListaDeArmacoes("D1;Vendida;;;;;;;0").linhas[0].quantidade, 0);
checa("lista vazia", lerListaDeArmacoes("  \n ").erros.length, 1);
checa("cabeçalho sem código recusa", lerListaDeArmacoes("Modelo;Preço\nX;10").erros[0].erro.includes("Código"), true);

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
if (falhas) process.exit(1);
