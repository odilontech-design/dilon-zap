import { prisma, marcacoesParaRep, cadeiaComHashes } from "@dilon-zap/ponto-db";
import { minutosNoturnos, noturnoReduzido, regras as regrasPadrao } from "@dilon-zap/ponto-core";
import {
  dataRep,
  gerarAej,
  gerarAfd,
  nomeArquivoAej,
  nomeArquivoAfd,
  type AusenciaAej,
  type EventoRep,
  type HorarioContratualAej,
  type MarcacaoAej,
} from "@dilon-zap/ponto-core/src/rep";
import { apurarIntervalo, SELECAO_EMPRESA_CALCULO, totalizar } from "@/lib/calculo";
import { assinarArquivoCades, certificadoConfigurado } from "@/lib/assinatura";
import { DIAS_CURTOS, previstoDoDia, type Semana } from "@/lib/jornada";
import { diaDaSemana } from "@/lib/datas";

/**
 * Dados do desenvolvedor do REP-P (a Dilon Tech), que vão no AFD, no AEJ, no
 * comprovante e no Atestado Técnico. Vêm do ambiente para não ficarem no
 * código: o número do INPI só existe depois do registro.
 */
export function dadosDoDesenvolvedor() {
  return {
    cnpj: (process.env.PONTO_DESENVOLVEDOR_CNPJ ?? "").replace(/\D/g, ""),
    razaoSocial: process.env.PONTO_DESENVOLVEDOR_RAZAO ?? "",
    email: process.env.PONTO_DESENVOLVEDOR_EMAIL ?? "",
    registroInpi: (process.env.PONTO_REGISTRO_INPI ?? "").replace(/\D/g, ""),
    versao: process.env.PONTO_VERSAO_PROGRAMA ?? "1.0",
    nomePrograma: "Dilon Ponto",
  };
}

/** O que falta para os arquivos saírem completos (para a tela de Configurações). */
export function pendenciasDoRep(): string[] {
  const d = dadosDoDesenvolvedor();
  const faltas: string[] = [];
  if (d.cnpj.length !== 14) faltas.push("CNPJ do desenvolvedor (PONTO_DESENVOLVEDOR_CNPJ)");
  if (!d.razaoSocial) faltas.push("razão social do desenvolvedor (PONTO_DESENVOLVEDOR_RAZAO)");
  if (!d.registroInpi) faltas.push("número de registro no INPI (PONTO_REGISTRO_INPI)");
  if (!certificadoConfigurado()) faltas.push("certificado digital ICP-Brasil (PONTO_CERT_PFX_BASE64)");
  return faltas;
}

export interface ArquivoRep {
  nome: string;
  conteudo: Buffer;
  /** Assinatura CAdES destacada; null se o certificado não estiver configurado. */
  p7s: Buffer | null;
}

const dentroDoPeriodo = (data: string, de: string, ate: string) => data >= de && data <= ate;

/**
 * AFD do estabelecimento num intervalo de datas (Anexo IX, item 12). Os
 * hashes são os da cadeia inteira (o anterior pode estar fora do período),
 * e os NSR são os originais.
 */
export async function gerarAfdDaEmpresa(empresaId: string, de: string, ate: string): Promise<ArquivoRep> {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
  const fuso = empresa.timezone;
  const dev = dadosDoDesenvolvedor();

  const [registros, marcacoes] = await Promise.all([
    prisma.registroRep.findMany({ where: { empresaId }, orderBy: { nsr: "asc" } }),
    marcacoesParaRep(prisma, empresaId).then((l) => cadeiaComHashes(l, fuso)),
  ]);

  const eventos: EventoRep[] = registros
    .filter((r) => dentroDoPeriodo(dataRep(r.gravadoEm, fuso), de, ate))
    .map((r) => {
      const d = r.dados as Record<string, string | null>;
      if (r.tipo === 2) {
        return {
          tipo: 2,
          nsr: r.nsr,
          gravadoEm: r.gravadoEm,
          cpfResponsavel: d.cpfResponsavel ?? "",
          empregador: { documento: d.documento ?? empresa.cnpj, cnoOuCaepf: d.cnoOuCaepf, razaoSocial: d.razaoSocial ?? "" },
          localPrestacao: d.localPrestacao ?? "",
        };
      }
      if (r.tipo === 5) {
        return {
          tipo: 5,
          nsr: r.nsr,
          gravadoEm: r.gravadoEm,
          operacao: (d.operacao as "I" | "A" | "E") ?? "I",
          cpf: d.cpf ?? "",
          nome: d.nome ?? "",
          cpfResponsavel: d.cpfResponsavel ?? "",
        };
      }
      return { tipo: 6, nsr: r.nsr, gravadoEm: r.gravadoEm, evento: (d.evento as "02" | "07" | "08") ?? "07" };
    });

  const { bytes } = gerarAfd({
    empregador: { documento: empresa.cnpj, cnoOuCaepf: empresa.cnoOuCaepf, razaoSocial: empresa.razaoSocial },
    desenvolvedor: { documento: dev.cnpj, registroInpi: dev.registroInpi },
    fuso,
    dataInicial: de,
    dataFinal: ate,
    geradoEm: new Date(),
    eventos,
    marcacoes: marcacoes
      .filter((m) => dentroDoPeriodo(dataRep(m.rep.marcadaEm, fuso), de, ate))
      .map((m) => ({ ...m.rep, hash: m.hash })),
  });

  const cert = certificadoConfigurado();
  return { nome: nomeArquivoAfd(dev.registroInpi || "0", empresa.cnpj), conteudo: bytes, p7s: cert ? assinarArquivoCades(bytes, cert) : null };
}

const hhmm = (h: string) => h.replace(":", "");

/**
 * AEJ do período, a partir do mesmo cálculo do espelho de ponto: marcações
 * originais e tratadas (incluídas e desconsideradas, com motivo), horário
 * contratual de cada dia, faltas, descanso semanal e banco de horas.
 */
export async function gerarAejDaEmpresa(empresaId: string, de: string, ate: string): Promise<ArquivoRep> {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: { ...SELECAO_EMPRESA_CALCULO, cnpj: true, razaoSocial: true, cnoOuCaepf: true } });
  const dev = dadosDoDesenvolvedor();
  const r = regrasPadrao();

  const colaboradores = await prisma.colaborador.findMany({
    where: {
      empresaId,
      admissao: { lte: new Date(`${ate}T00:00:00Z`) },
      OR: [{ desligadoEm: null }, { desligadoEm: { gte: new Date(`${de}T00:00:00Z`) } }],
    },
    orderBy: { nome: "asc" },
    include: { jornada: { select: { id: true, nome: true, semana: true } } },
  });

  const jornadas = [...new Map(colaboradores.map((c) => [c.jornada.id, c.jornada])).values()];
  const horarios: HorarioContratualAej[] = [];
  const codigo = (jornadaIdx: number, dia: number) => `J${jornadaIdx + 1}-${DIAS_CURTOS[dia].toUpperCase()}`;
  jornadas.forEach((j, idx) => {
    const semana = j.semana as unknown as Semana;
    for (let d = 0; d < 7; d++) {
      const pares = semana[String(d)] ?? [];
      if (!pares.length) continue;
      const turnos = previstoDoDia(semana, d);
      const real = turnos.reduce((s, t) => s + t.fim - t.inicio, 0);
      const noturno = minutosNoturnos(turnos, r);
      horarios.push({
        codigo: codigo(idx, d),
        // "Caso o horário seja noturno, considerar a redução da hora noturna."
        duracaoMin: real - noturno + noturnoReduzido(noturno, r),
        pares: pares.map(([a, b]) => [hhmm(a), hhmm(b)] as [string, string]),
      });
    }
  });

  const marcacoes: MarcacaoAej[] = [];
  const ausencias: AusenciaAej[] = [];
  for (const [i, c] of colaboradores.entries()) {
    const vinculo = i + 1;
    const jIdx = jornadas.findIndex((j) => j.id === c.jornada.id);
    const dias = await apurarIntervalo(empresa, c, de, ate);
    for (const d of dias) {
      if (d.situacao !== "NORMAL" && d.situacao !== "HOJE") continue;
      let par = 0;
      let entrada = true;
      const temHorario = (c.jornada.semana as unknown as Semana)[String(diaDaSemana(d.data))]?.length > 0;
      for (const m of d.marcacoes) {
        if (m.desconsiderada) {
          marcacoes.push({ vinculo, dataHora: m.instante, tipo: "D", par: Math.max(1, par), fonte: "O", motivo: m.desconsiderada.motivo });
          continue;
        }
        if (entrada) par++;
        marcacoes.push({
          vinculo,
          dataHora: m.instante,
          tipo: entrada ? "E" : "S",
          par,
          fonte: m.origem === "INCLUSAO" ? "I" : "O",
          codHorario: entrada && par === 1 && temHorario && !d.feriado ? codigo(jIdx, d.diaSemana) : null,
          motivo: m.origem === "INCLUSAO" ? m.motivoInclusao : null,
        });
        entrada = !entrada;
      }
      const a = d.apuracao;
      if (d.situacao !== "NORMAL" || !a) continue;
      if (a.falta && a.debitoMin > 0) ausencias.push({ vinculo, tipo: 2, data: d.data });
      if (d.tipoDia === "DESCANSO" && d.marcacoes.length === 0) ausencias.push({ vinculo, tipo: 1, data: d.data });
    }
    if (empresa.bancoDeHoras) {
      for (const l of totalizar(dias, empresa).lancamentosBanco) {
        ausencias.push({ vinculo, tipo: 3, data: l.data, minutos: Math.abs(l.minutos), movimentoBanco: l.minutos > 0 ? 1 : 2 });
      }
    }
  }

  const { bytes } = gerarAej({
    empregador: { documento: empresa.cnpj, razaoSocial: empresa.razaoSocial, caepf: null, cno: empresa.cnoOuCaepf },
    fuso: empresa.timezone,
    dataInicial: de,
    dataFinal: ate,
    geradoEm: new Date(),
    registroInpi: dev.registroInpi || "0",
    vinculos: colaboradores.map((c, i) => ({ id: i + 1, cpf: c.cpf, nome: c.nome })),
    horarios,
    marcacoes,
    ausencias,
    programa: {
      nome: dev.nomePrograma,
      versao: dev.versao,
      documentoDesenvolvedor: dev.cnpj,
      razaoDesenvolvedor: dev.razaoSocial || "Dilon Tech",
      email: dev.email,
    },
  });

  const cert = certificadoConfigurado();
  return { nome: nomeArquivoAej(empresa.cnpj, de, ate), conteudo: bytes, p7s: cert ? assinarArquivoCades(bytes, cert) : null };
}
