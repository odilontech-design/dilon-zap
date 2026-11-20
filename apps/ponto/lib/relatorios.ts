import { prisma } from "@dilon-zap/ponto-db";
import { espelhoDoMes, SELECAO_EMPRESA_CALCULO, type Espelho } from "@/lib/calculo";
import { dataBr, dataHoraNoFuso, diasDoMes, inicioDoDiaUtc, somarDias } from "@/lib/datas";
import { formatarCpf } from "@/lib/documentos";
import { horas, NOME_OCORRENCIA, percentual, saldo } from "@/lib/formato";

/**
 * Relatórios do mês. Cada um devolve `{ colunas, linhas }` em texto: a tela
 * mostra como tabela e a rota de exportação gera o CSV a partir do MESMO
 * resultado, para o número da tela e o da planilha nunca divergirem.
 */

export type TipoRelatorio = "resumo" | "ocorrencias" | "conferir" | "ajustes" | "marcacoes";

export const RELATORIOS: Record<TipoRelatorio, { titulo: string; descricao: string }> = {
  resumo: { titulo: "Resumo do mês", descricao: "Horas, extras, noturno, faltas e banco de horas por colaborador. É o que vai para a folha." },
  ocorrencias: { titulo: "Ocorrências", descricao: "Faltas, atrasos, intervalos curtos, interjornada e marcações ímpares, dia a dia." },
  conferir: { titulo: "Marcações para conferir", descricao: "Registros sem localização, sem foto ou feitos sem internet." },
  ajustes: { titulo: "Ajustes manuais", descricao: "Toda inclusão, desconsideração e abono, com autor e motivo." },
  marcacoes: { titulo: "Marcações (registro original)", descricao: "Todas as marcações do mês com NSR, localização e código de integridade." },
};

export interface Relatorio {
  colunas: string[];
  linhas: string[][];
}

async function contexto(empresaId: string, mes: string) {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: SELECAO_EMPRESA_CALCULO });
  const dias = diasDoMes(mes);
  const de = inicioDoDiaUtc(dias[0], empresa.timezone);
  const ate = inicioDoDiaUtc(somarDias(dias[dias.length - 1], 1), empresa.timezone);
  return { empresa, dias, de, ate };
}

async function espelhos(empresaId: string, mes: string): Promise<Array<{ nome: string; cpf: string; espelho: Espelho }>> {
  const { empresa, dias } = await contexto(empresaId, mes);
  const fimMes = new Date(`${dias[dias.length - 1]}T00:00:00Z`);
  const inicioMes = new Date(`${dias[0]}T00:00:00Z`);
  const colaboradores = await prisma.colaborador.findMany({
    where: {
      empresaId,
      admissao: { lte: fimMes },
      OR: [{ desligadoEm: null }, { desligadoEm: { gte: inicioMes } }],
    },
    orderBy: { nome: "asc" },
    include: { jornada: { select: { semana: true } } },
  });
  return Promise.all(colaboradores.map(async (c) => ({ nome: c.nome, cpf: c.cpf, espelho: await espelhoDoMes(empresa, c, mes) })));
}

export async function gerarRelatorio(tipo: TipoRelatorio, empresaId: string, mes: string): Promise<Relatorio> {
  if (tipo === "resumo") {
    const lista = await espelhos(empresaId, mes);
    const percentuais = [...new Set(lista.flatMap((l) => l.espelho.totais.extrasAPagar.map((e) => e.percentualBp)))].sort((a, b) => a - b);
    return {
      colunas: [
        "Colaborador",
        "CPF",
        "Previsto",
        "Trabalhado",
        ...percentuais.map((p) => `Extra ${percentual(p)}`),
        "Noturno",
        "Faltas",
        "Atrasos",
        "Abonado",
        "Débito a descontar",
        "Banco no mês",
        "Saldo do banco",
        "Dias para corrigir",
      ],
      linhas: lista.map(({ nome, cpf, espelho: e }) => {
        const t = e.totais;
        const extra = (p: number) => t.extrasAPagar.find((x) => x.percentualBp === p)?.minutos ?? 0;
        return [
          nome,
          formatarCpf(cpf),
          horas(t.previstoMin, false),
          horas(t.trabalhadoMin, false),
          ...percentuais.map((p) => horas(extra(p), false)),
          horas(t.noturnoReduzidoMin, false),
          String(t.faltas),
          horas(t.atrasoMin, false),
          horas(t.abonoMin, false),
          horas(t.debitoADescontarMin, false),
          e.banco ? saldo(t.lancamentosBanco.reduce((s, l) => s + l.minutos, 0)) : "—",
          e.banco ? saldo(e.banco.saldoMin) : "—",
          String(t.diasIncompletos.length),
        ];
      }),
    };
  }

  if (tipo === "ocorrencias") {
    const lista = await espelhos(empresaId, mes);
    const linhas: string[][] = [];
    for (const { nome, espelho } of lista) {
      for (const d of espelho.dias) {
        const a = d.apuracao;
        if (!a || d.situacao !== "NORMAL") continue;
        for (const o of a.ocorrencias.filter((x) => x !== "HORA_EXTRA")) {
          const detalhe =
            o === "ATRASO"
              ? horas(a.atrasoMin)
              : o === "SAIDA_ANTECIPADA"
                ? horas(a.saidaAntecipadaMin)
                : o === "FALTA"
                  ? horas(a.debitoMin)
                  : o === "INTERVALO_INSUFICIENTE"
                    ? `gozou ${horas(a.intervalo.gozadoMin, false)} de ${horas(a.intervalo.exigidoMin)}`
                    : o === "INTERJORNADA_INSUFICIENTE"
                      ? `descanso de ${horas(a.interjornada?.descansoMin ?? 0)}`
                      : o === "LIMITE_EXTRA_EXCEDIDO" || o === "TRABALHO_EM_DESCANSO"
                        ? horas(a.extraMin)
                        : "";
          linhas.push([dataBr(d.data), nome, NOME_OCORRENCIA[o] ?? o, detalhe, d.marcacoes.filter((m) => !m.desconsiderada).map((m) => m.hora).join(" ")]);
        }
      }
    }
    linhas.sort((a, b) => a[0].split("/").reverse().join().localeCompare(b[0].split("/").reverse().join()) || a[1].localeCompare(b[1]));
    return { colunas: ["Data", "Colaborador", "Ocorrência", "Quanto", "Marcações"], linhas };
  }

  const { empresa, de, ate } = await contexto(empresaId, mes);
  const fuso = empresa.timezone;

  if (tipo === "conferir" || tipo === "marcacoes") {
    const marcacoes = await prisma.marcacao.findMany({
      where: { empresaId, instante: { gte: de, lt: ate }, ...(tipo === "conferir" ? { revisar: { not: null } } : {}) },
      orderBy: { nsr: "asc" },
      include: { colaborador: { select: { nome: true, cpf: true } } },
    });
    if (tipo === "conferir") {
      return {
        colunas: ["NSR", "Data e hora", "Colaborador", "Motivo"],
        linhas: marcacoes.map((m) => [String(m.nsr), dataHoraNoFuso(m.instante, fuso), m.colaborador.nome, m.revisar ?? ""]),
      };
    }
    return {
      colunas: ["NSR", "Data e hora", "Colaborador", "CPF", "Canal", "Latitude", "Longitude", "Precisão (m)", "Foto", "Sem internet", "Código"],
      linhas: marcacoes.map((m) => [
        String(m.nsr),
        dataHoraNoFuso(m.instante, fuso),
        m.colaborador.nome,
        formatarCpf(m.colaborador.cpf),
        m.canal === "APP" ? "Aplicativo" : "Web",
        m.latitude?.toFixed(6) ?? "",
        m.longitude?.toFixed(6) ?? "",
        m.precisaoM != null ? String(Math.round(m.precisaoM)) : "",
        m.fotoChave ? "sim" : "não",
        m.offline ? "sim" : "não",
        m.hash.slice(0, 16),
      ]),
    };
  }

  // ajustes
  const [tratamentos, abonos] = await Promise.all([
    prisma.tratamento.findMany({
      where: { empresaId, criadoEm: { gte: de, lt: ate } },
      include: { colaborador: { select: { nome: true } }, marcacao: { select: { instante: true, nsr: true } } },
    }),
    prisma.abono.findMany({ where: { empresaId, criadoEm: { gte: de, lt: ate } }, include: { colaborador: { select: { nome: true } } } }),
  ]);
  const linhas: Array<{ quando: Date; linha: string[] }> = [
    ...tratamentos.map((t) => ({
      quando: t.criadoEm,
      linha: [
        dataHoraNoFuso(t.criadoEm, fuso),
        t.colaborador.nome,
        t.tipo === "INCLUSAO" ? "Inclusão de marcação" : `Desconsideração (NSR ${t.marcacao?.nsr})`,
        dataHoraNoFuso((t.instante ?? t.marcacao?.instante)!, fuso),
        t.motivo,
        t.autorNome,
        t.revogadoEm ? `desfeito por ${t.revogadoPor}` : "",
      ],
    })),
    ...abonos.map((a) => ({
      quando: a.criadoEm,
      linha: [
        dataHoraNoFuso(a.criadoEm, fuso),
        a.colaborador.nome,
        `Abono de ${horas(a.minutos)}`,
        dataBr(a.data.toISOString().slice(0, 10)),
        a.motivo,
        a.autorNome,
        a.revogadoEm ? "desfeito" : "",
      ],
    })),
  ];
  linhas.sort((a, b) => a.quando.getTime() - b.quando.getTime());
  return { colunas: ["Quando", "Colaborador", "Ajuste", "Referente a", "Motivo", "Feito por", "Situação"], linhas: linhas.map((l) => l.linha) };
}

/** CSV no padrão que o Excel em português abre direto: ";" e BOM UTF-8. */
export function paraCsv(r: Relatorio): string {
  const celula = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [r.colunas, ...r.linhas].map((l) => l.map(celula).join(";")).join("\r\n");
}
