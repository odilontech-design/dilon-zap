import { prisma, type Colaborador, type Empresa, type Jornada } from "@dilon-zap/ponto-db";
import {
  apurarDia,
  extratoBanco,
  fecharPeriodo,
  iniciosDasJanelas,
  minutoLocal,
  MINUTOS_DIA,
  regras as montarRegras,
  type ApuracaoDia,
  type ExtratoBanco,
  type FechamentoPeriodo,
  type RegrasCalculo,
  type TipoDia,
} from "@dilon-zap/ponto-core";
import { diaDaSemana, diasDoMes, hojeNoFuso, horaNoFuso, inicioDoDiaUtc, somarDias, somarMeses } from "@/lib/datas";
import { previstoDoDia, resumoDia, type Semana } from "@/lib/jornada";

/**
 * Ponte entre o banco e o motor (`@dilon-zap/ponto-core`).
 *
 * Aqui mora tudo o que o motor não sabe: ler marcações e ajustes do banco,
 * aplicar os tratamentos, converter instante UTC para a linha do tempo do dia
 * no fuso da empresa, decidir a qual dia cada marcação pertence, e não cobrar
 * falta de dia futuro nem de antes da admissão.
 */

export type EmpresaCalculo = Pick<
  Empresa,
  | "id"
  | "timezone"
  | "toleranciaPorMarcacaoMin"
  | "toleranciaDiariaMin"
  | "percentualExtraBp"
  | "percentualDescansoBp"
  | "percentualNoturnoBp"
  | "bancoDeHoras"
  | "validadeBancoDias"
  | "criadoEm"
>;
export type ColaboradorCalculo = Pick<Colaborador, "id" | "admissao" | "desligadoEm"> & { jornada: Pick<Jornada, "semana"> };

export function regrasDaEmpresa(e: EmpresaCalculo): RegrasCalculo {
  const base = montarRegras();
  return montarRegras({
    toleranciaPorMarcacaoMin: e.toleranciaPorMarcacaoMin,
    toleranciaDiariaMin: e.toleranciaDiariaMin,
    extrasDiaUtil: [{ ateMin: null, percentualBp: e.percentualExtraBp }],
    percentualDescansoBp: e.percentualDescansoBp,
    noturno: { ...base.noturno, percentualBp: e.percentualNoturnoBp },
  });
}

export interface MarcacaoDoDia {
  /** id da Marcacao (original) ou do Tratamento (incluída). */
  id: string;
  origem: "REGISTRO" | "INCLUSAO";
  instante: Date;
  hora: string;
  /** Dia seguinte ao do espelho (turno que passou da meia-noite). */
  diaSeguinte: boolean;
  nsr: number | null;
  desconsiderada: { tratamentoId: string; motivo: string; autor: string } | null;
  motivoInclusao: string | null;
  autorInclusao: string | null;
  revisar: string | null;
  temFoto: boolean;
  offline: boolean;
}

export type SituacaoDia = "NORMAL" | "HOJE" | "FUTURO" | "FORA_DO_CONTRATO";

export interface DiaEspelho {
  data: string;
  diaSemana: number;
  tipoDia: TipoDia;
  feriado: string | null;
  previstoTexto: string;
  marcacoes: MarcacaoDoDia[];
  abonos: Array<{ id: string; minutos: number; motivo: string; autor: string }>;
  situacao: SituacaoDia;
  /** Por que o dia está fora do controle (antes da admissão, depois do desligamento...). */
  motivoFora: string | null;
  apuracao: ApuracaoDia | null;
}

const dataIso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * O controle começa no dia em que a empresa entrou no sistema. Antes disso não
 * há marcação, e cobrar falta desses dias (ou levá-los ao banco de horas)
 * seria inventar débito.
 */
export function inicioDoControle(empresa: Pick<EmpresaCalculo, "criadoEm" | "timezone">): string {
  return hojeNoFuso(empresa.timezone, empresa.criadoEm);
}

export async function apurarIntervalo(
  empresa: EmpresaCalculo,
  colaborador: ColaboradorCalculo,
  inicio: string,
  fim: string,
): Promise<DiaEspelho[]> {
  const fuso = empresa.timezone;
  const hoje = hojeNoFuso(fuso);
  const semana = colaborador.jornada.semana as unknown as Semana;
  const r = regrasDaEmpresa(empresa);

  // Um dia antes e um depois: a madrugada do dia anterior e a saída do turno
  // noturno do último dia precisam entrar na conta.
  const dias: string[] = [];
  for (let d = somarDias(inicio, -1); d <= somarDias(fim, 1); d = somarDias(d, 1)) dias.push(d);
  const referencia = dias[0];
  const previstos = dias.map((d) => previstoDoDia(semana, diaDaSemana(d)));

  const de = inicioDoDiaUtc(referencia, fuso);
  const ate = inicioDoDiaUtc(somarDias(dias[dias.length - 1], 1), fuso);

  const [marcacoes, inclusoes, abonos, feriados] = await Promise.all([
    prisma.marcacao.findMany({
      where: { colaboradorId: colaborador.id, instante: { gte: de, lt: ate } },
      select: {
        id: true,
        nsr: true,
        instante: true,
        revisar: true,
        fotoChave: true,
        offline: true,
        tratamentos: {
          where: { tipo: "DESCONSIDERACAO", revogadoEm: null },
          select: { id: true, motivo: true, autorNome: true },
          take: 1,
        },
      },
      orderBy: { instante: "asc" },
    }),
    prisma.tratamento.findMany({
      where: { colaboradorId: colaborador.id, tipo: "INCLUSAO", revogadoEm: null, instante: { gte: de, lt: ate } },
      select: { id: true, instante: true, motivo: true, autorNome: true },
    }),
    prisma.abono.findMany({
      where: {
        colaboradorId: colaborador.id,
        revogadoEm: null,
        data: { gte: new Date(`${inicio}T00:00:00Z`), lte: new Date(`${fim}T00:00:00Z`) },
      },
    }),
    prisma.feriado.findMany({
      where: {
        empresaId: empresa.id,
        data: { gte: new Date(`${inicio}T00:00:00Z`), lte: new Date(`${fim}T00:00:00Z`) },
      },
    }),
  ]);

  const itens: MarcacaoDoDia[] = [
    ...marcacoes.map((m) => ({
      id: m.id,
      origem: "REGISTRO" as const,
      instante: m.instante,
      hora: horaNoFuso(m.instante, fuso),
      diaSeguinte: false,
      nsr: m.nsr,
      desconsiderada: m.tratamentos[0]
        ? { tratamentoId: m.tratamentos[0].id, motivo: m.tratamentos[0].motivo, autor: m.tratamentos[0].autorNome }
        : null,
      motivoInclusao: null,
      autorInclusao: null,
      revisar: m.revisar,
      temFoto: Boolean(m.fotoChave),
      offline: m.offline,
    })),
    ...inclusoes.map((t) => ({
      id: t.id,
      origem: "INCLUSAO" as const,
      instante: t.instante!,
      hora: horaNoFuso(t.instante!, fuso),
      diaSeguinte: false,
      nsr: null,
      desconsiderada: null,
      motivoInclusao: t.motivo,
      autorInclusao: t.autorNome,
      revisar: null,
      temFoto: false,
      offline: false,
    })),
  ].sort((a, b) => a.instante.getTime() - b.instante.getTime());

  // Cada marcação vai para a janela do dia a que pertence (ver ponto-core/distribuicao).
  const inicios = iniciosDasJanelas(previstos);
  const porDia: Array<Array<{ item: MarcacaoDoDia; minuto: number }>> = dias.map(() => []);
  for (const item of itens) {
    const abs = minutoLocal(item.instante, referencia, fuso);
    let i = inicios.length - 1;
    while (i >= 0 && abs < inicios[i]) i--;
    if (i < 0) continue;
    const minuto = abs - i * MINUTOS_DIA;
    item.diaSeguinte = minuto >= MINUTOS_DIA;
    porDia[i].push({ item, minuto });
  }
  const efetivas = porDia.map((lista) => lista.filter((x) => !x.item.desconsiderada).map((x) => x.minuto));

  const admissao = dataIso(colaborador.admissao);
  const desligamento = colaborador.desligadoEm ? dataIso(colaborador.desligadoEm) : null;
  const inicioSistema = inicioDoControle(empresa);
  const feriadoPorData = new Map(feriados.map((f) => [dataIso(f.data), f.nome]));

  const resultado: DiaEspelho[] = [];
  for (let i = 1; i < dias.length - 1; i++) {
    const data = dias[i];
    const diaSemana = diaDaSemana(data);
    const feriado = feriadoPorData.get(data) ?? null;
    const previsto = previstos[i];
    const tipoDia: TipoDia = feriado ? "FERIADO" : previsto.length === 0 ? "DESCANSO" : "UTIL";
    const abonosDoDia = abonos
      .filter((a) => dataIso(a.data) === data)
      .map((a) => ({ id: a.id, minutos: a.minutos, motivo: a.motivo, autor: a.autorNome }));

    const motivoFora =
      data < admissao
        ? "antes da admissão"
        : desligamento && data > desligamento
          ? "desligado"
          : data < inicioSistema
            ? "antes do início do controle"
            : null;
    const situacao: SituacaoDia = motivoFora
        ? "FORA_DO_CONTRATO"
        : data > hoje
          ? "FUTURO"
          : data === hoje
            ? "HOJE"
            : "NORMAL";

    let apuracao: ApuracaoDia | null = null;
    if (situacao === "NORMAL" || situacao === "HOJE") {
      const anteriores = efetivas[i - 1];
      apuracao = apurarDia(
        {
          tipoDia,
          previsto,
          marcacoes: efetivas[i],
          abonoMin: abonosDoDia.reduce((s, a) => s + a.minutos, 0),
          ultimaSaidaAnterior:
            anteriores.length > 0 && anteriores.length % 2 === 0 ? anteriores[anteriores.length - 1] - MINUTOS_DIA : null,
        },
        r,
      );
    }

    resultado.push({
      data,
      diaSemana,
      tipoDia,
      feriado,
      previstoTexto: resumoDia(semana, diaSemana),
      marcacoes: porDia[i].map((x) => x.item),
      abonos: abonosDoDia,
      situacao,
      motivoFora,
      apuracao,
    });
  }
  return resultado;
}

/** Fecha os dias já encerrados (hoje fica de fora até acabar). */
export function totalizar(dias: DiaEspelho[], empresa: EmpresaCalculo): FechamentoPeriodo {
  return fecharPeriodo(
    dias.filter((d) => d.situacao === "NORMAL" && d.apuracao).map((d) => ({ data: d.data, apuracao: d.apuracao! })),
    { bancoDeHoras: empresa.bancoDeHoras ? { incluirDiasDeDescanso: false } : null },
  );
}

export interface Espelho {
  mes: string;
  dias: DiaEspelho[];
  totais: FechamentoPeriodo;
  banco: ExtratoBanco | null;
  bancoDesde: string | null;
}

/**
 * Espelho do mês, com o saldo do banco de horas.
 *
 * O banco é recalculado a partir das marcações dos últimos 12 meses (ou da
 * admissão, se for mais recente), sem guardar saldo em tabela: assim um
 * ajuste num mês antigo corrige o saldo de hoje sozinho. Crédito mais velho
 * que isso já venceu pela validade máxima de 12 meses (acordo coletivo).
 */
export async function espelhoDoMes(
  empresa: EmpresaCalculo,
  colaborador: ColaboradorCalculo,
  mes: string,
): Promise<Espelho> {
  const lista = diasDoMes(mes);
  const dias = await apurarIntervalo(empresa, colaborador, lista[0], lista[lista.length - 1]);
  const totais = totalizar(dias, empresa);

  if (!empresa.bancoDeHoras) return { mes, dias, totais, banco: null, bancoDesde: null };

  const ontem = somarDias(hojeNoFuso(empresa.timezone), -1);
  const fimBanco = lista[lista.length - 1] < ontem ? lista[lista.length - 1] : ontem;
  const inicioBanco = [dataIso(colaborador.admissao), inicioDoControle(empresa), `${somarMeses(mes, -12)}-01`].sort().at(-1)!;

  if (fimBanco < inicioBanco) return { mes, dias, totais, banco: extratoBanco([], fimBanco, { validadeDias: 1 }), bancoDesde: inicioBanco };

  const historico = await apurarIntervalo(empresa, colaborador, inicioBanco, fimBanco);
  const movimento = totalizar(historico, empresa).lancamentosBanco;
  const banco = extratoBanco(movimento, fimBanco, { validadeDias: empresa.validadeBancoDias });
  return { mes, dias, totais, banco, bancoDesde: inicioBanco };
}

export const SELECAO_EMPRESA_CALCULO = {
  id: true,
  timezone: true,
  toleranciaPorMarcacaoMin: true,
  toleranciaDiariaMin: true,
  percentualExtraBp: true,
  percentualDescansoBp: true,
  percentualNoturnoBp: true,
  bancoDeHoras: true,
  validadeBancoDias: true,
  criadoEm: true,
} as const;
