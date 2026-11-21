"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@dilon-zap/ponto-db";
import { isStorageConfigured, uploadMedia } from "@dilon-zap/storage";
import { acaoDeAdmin, acaoDeColaborador, ErroDeAcao, type Resultado } from "@/lib/acoes";
import { auditar } from "@/lib/auditoria";
import { hojeNoFuso, horaNoFuso, inicioDoDiaUtc, localParaUtc, somarDias } from "@/lib/datas";
import type { Semana } from "@/lib/jornada";
import { temRecurso } from "@/lib/planos";
import type { UsuarioAtual } from "@/lib/session";
import {
  diasDoAtestado,
  duracaoEmMinutos,
  MAX_ANEXO_BYTES,
  MAX_DIAS_ATESTADO,
  MIMES_ANEXO,
  resumoSolicitacao,
} from "@/lib/solicitacoes-regras";

/**
 * Solicitações: o colaborador pede, a empresa decide. A solicitação nunca
 * mexe no ponto sozinha; a aprovação cria o tratamento (inclusão ou
 * desconsideração) ou os abonos, com o autor da decisão e o vínculo com o
 * pedido. A marcação original continua intacta, como em qualquer ajuste.
 */

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM)");
const texto = (min: number, msg: string) => z.string().trim().min(min, msg).max(500);

function exigirSolicitacoes(u: UsuarioAtual) {
  if (!temRecurso(u.empresa.plano, "SOLICITACOES")) throw new ErroDeAcao("Solicitações não fazem parte do plano da empresa.");
}

function atualizar() {
  revalidatePath("/solicitacoes");
  revalidatePath("/painel");
  revalidatePath("/ponto");
  revalidatePath("/meu-ponto");
}

/** Marcações do colaborador num dia (para escolher qual desconsiderar). */
export async function marcacoesDoDia(dia: string): Promise<Resultado<Array<{ id: string; hora: string; nsr: number }>>> {
  return acaoDeColaborador(async (u) => {
    const d = data.parse(dia);
    const fuso = u.empresa.timezone;
    const lista = await prisma.marcacao.findMany({
      where: { colaboradorId: u.colaboradorId, instante: { gte: inicioDoDiaUtc(d, fuso), lt: inicioDoDiaUtc(somarDias(d, 1), fuso) } },
      orderBy: { instante: "asc" },
      select: { id: true, instante: true, nsr: true },
    });
    return lista.map((m) => ({ id: m.id, hora: horaNoFuso(m.instante, fuso), nsr: m.nsr }));
  });
}

export async function criarSolicitacao(form: FormData): Promise<Resultado> {
  return acaoDeColaborador(async (u) => {
    exigirSolicitacoes(u);
    const campo = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
    };
    const tipo = z.enum(["INCLUSAO", "DESCONSIDERACAO", "ABONO", "ATESTADO"]).parse(campo("tipo"));
    const dia = data.parse(campo("data"));
    const justificativa = texto(5, "Explique o motivo (pelo menos 5 letras)").parse(campo("justificativa") ?? "");
    const fuso = u.empresa.timezone;
    const hoje = hojeNoFuso(fuso);

    const colaborador = await prisma.colaborador.findUniqueOrThrow({ where: { id: u.colaboradorId } });
    const admissao = colaborador.admissao.toISOString().slice(0, 10);
    if (dia < admissao) throw new ErroDeAcao("A data é anterior à sua admissão.");

    const dados: {
      dataFim?: Date;
      hora?: string;
      diaSeguinte?: boolean;
      marcacaoId?: string;
      minutos?: number;
    } = {};

    if (tipo === "ATESTADO") {
      const fim = data.parse(campo("dataFim") ?? dia);
      if (fim < dia) throw new ErroDeAcao("O último dia vem antes do primeiro.");
      if (fim > somarDias(hoje, MAX_DIAS_ATESTADO)) throw new ErroDeAcao("Período longo demais.");
      if (somarDias(dia, MAX_DIAS_ATESTADO - 1) < fim) throw new ErroDeAcao(`Atestado de até ${MAX_DIAS_ATESTADO} dias por solicitação.`);
      dados.dataFim = new Date(`${fim}T00:00:00Z`);
    } else if (dia > hoje) {
      throw new ErroDeAcao("Só dá para pedir ajuste de hoje ou de dias passados.");
    }

    if (tipo === "INCLUSAO") {
      dados.hora = hora.parse(campo("hora"));
      dados.diaSeguinte = campo("diaSeguinte") === "1";
      const instante = localParaUtc(dados.diaSeguinte ? somarDias(dia, 1) : dia, dados.hora, fuso);
      if (instante.getTime() > Date.now()) throw new ErroDeAcao("Esse horário ainda não chegou.");
    }
    if (tipo === "DESCONSIDERACAO") {
      const id = z.string().min(1, "Escolha a marcação").parse(campo("marcacaoId"));
      const m = await prisma.marcacao.findFirst({ where: { id, colaboradorId: u.colaboradorId } });
      if (!m) throw new ErroDeAcao("Marcação não encontrada.");
      dados.marcacaoId = m.id;
    }
    if (tipo === "ABONO") {
      const min = duracaoEmMinutos(campo("duracao") ?? "");
      if (!min) throw new ErroDeAcao("Informe as horas a abonar (ex.: 2:30).");
      dados.minutos = min;
    }

    const arquivo = form.get("anexo");
    const anexo = arquivo instanceof File && arquivo.size > 0 ? arquivo : null;
    if (tipo === "ATESTADO" && !anexo) throw new ErroDeAcao("Anexe a foto ou o PDF do atestado.");
    if (anexo) {
      if (anexo.size > MAX_ANEXO_BYTES) throw new ErroDeAcao("O anexo pode ter até 4 MB.");
      if (!(MIMES_ANEXO as readonly string[]).includes(anexo.type)) throw new ErroDeAcao("Anexe um PDF ou uma foto (JPG, PNG).");
    }

    const s = await prisma.solicitacao.create({
      data: {
        empresaId: u.empresaId,
        colaboradorId: u.colaboradorId,
        tipo,
        data: new Date(`${dia}T00:00:00Z`),
        justificativa,
        autorId: u.id,
        autorNome: u.nome,
        ...dados,
      },
    });

    if (anexo) {
      const bytes = Buffer.from(await anexo.arrayBuffer());
      const nome = anexo.name.slice(0, 120) || "anexo";
      if (isStorageConfigured()) {
        const chave = `ponto/${u.empresaId}/solicitacoes/${s.id}`;
        await uploadMedia(chave, bytes, anexo.type);
        await prisma.solicitacao.update({ where: { id: s.id }, data: { anexoChave: chave, anexoNome: nome, anexoMime: anexo.type } });
      } else {
        await prisma.$transaction([
          prisma.solicitacaoAnexo.create({ data: { solicitacaoId: s.id, bytes } }),
          prisma.solicitacao.update({ where: { id: s.id }, data: { anexoChave: `db:${s.id}`, anexoNome: nome, anexoMime: anexo.type } }),
        ]);
      }
    }

    await auditar(u, "abrir_solicitacao", "Solicitacao", s.id, { tipo, data: dia });
    atualizar();
  });
}

export async function cancelarSolicitacao(id: string): Promise<Resultado> {
  return acaoDeColaborador(async (u) => {
    const r = await prisma.solicitacao.updateMany({
      where: { id, colaboradorId: u.colaboradorId, status: "PENDENTE" },
      data: { status: "CANCELADA", decididoEm: new Date(), decididoPor: u.nome },
    });
    if (r.count === 0) throw new ErroDeAcao("Essa solicitação já foi decidida.");
    await auditar(u, "cancelar_solicitacao", "Solicitacao", id);
    atualizar();
  });
}

export async function decidirSolicitacao(entrada: { id: string; aprovar: boolean; resposta?: string }): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    exigirSolicitacoes(u);
    const p = z.object({ id: z.string(), aprovar: z.boolean(), resposta: z.string().trim().max(500).optional() }).parse(entrada);
    if (!p.aprovar && (!p.resposta || p.resposta.length < 3)) throw new ErroDeAcao("Informe o motivo da recusa.");

    const s = await prisma.solicitacao.findFirst({
      where: { id: p.id, empresaId: u.empresaId },
      include: { colaborador: { include: { jornada: { select: { semana: true } } } } },
    });
    if (!s) throw new ErroDeAcao("Solicitação não encontrada.");
    if (s.status !== "PENDENTE") throw new ErroDeAcao("Essa solicitação já foi decidida.");

    const fuso = u.empresa.timezone;
    const dia = s.data.toISOString().slice(0, 10);
    const fim = s.dataFim?.toISOString().slice(0, 10) ?? dia;

    await prisma.$transaction(async (tx) => {
      // Trava contra decisão dupla (dois administradores ao mesmo tempo).
      const r = await tx.solicitacao.updateMany({
        where: { id: s.id, status: "PENDENTE" },
        data: { status: p.aprovar ? "APROVADA" : "RECUSADA", decididoEm: new Date(), decididoPor: u.nome, resposta: p.resposta || null },
      });
      if (r.count === 0) throw new ErroDeAcao("Essa solicitação já foi decidida.");
      if (!p.aprovar) return;

      const base = { empresaId: u.empresaId, colaboradorId: s.colaboradorId, autorId: u.id, autorNome: u.nome, solicitacaoId: s.id };
      let horaMarcacao: string | null = null;
      if (s.tipo === "DESCONSIDERACAO" && s.marcacaoId) {
        const m = await tx.marcacao.findUniqueOrThrow({ where: { id: s.marcacaoId } });
        horaMarcacao = horaNoFuso(m.instante, fuso);
      }
      const motivo = `${resumoSolicitacao({ tipo: s.tipo, data: dia, dataFim: fim, hora: s.hora, diaSeguinte: s.diaSeguinte, minutos: s.minutos, horaMarcacao })}. A pedido do colaborador: ${s.justificativa}`;

      switch (s.tipo) {
        case "INCLUSAO": {
          const instante = localParaUtc(s.diaSeguinte ? somarDias(dia, 1) : dia, s.hora ?? "", fuso);
          await tx.tratamento.create({ data: { ...base, tipo: "INCLUSAO", instante, motivo } });
          break;
        }
        case "DESCONSIDERACAO": {
          const ja = await tx.tratamento.findFirst({ where: { marcacaoId: s.marcacaoId, tipo: "DESCONSIDERACAO", revogadoEm: null } });
          if (ja) throw new ErroDeAcao("Essa marcação já está desconsiderada. Recuse a solicitação explicando.");
          await tx.tratamento.create({ data: { ...base, tipo: "DESCONSIDERACAO", marcacaoId: s.marcacaoId, motivo } });
          break;
        }
        case "ABONO":
          await tx.abono.create({ data: { ...base, data: s.data, minutos: s.minutos ?? 0, motivo } });
          break;
        case "ATESTADO": {
          const feriados = await tx.feriado.findMany({
            where: { empresaId: u.empresaId, data: { gte: s.data, lte: new Date(`${fim}T00:00:00Z`) } },
            select: { data: true },
          });
          const dias = diasDoAtestado(dia, fim, s.colaborador.jornada.semana as unknown as Semana, new Set(feriados.map((f) => f.data.toISOString().slice(0, 10))));
          if (!dias.length) throw new ErroDeAcao("Nenhum dia de trabalho previsto no período: não há o que abonar. Recuse explicando.");
          await tx.abono.createMany({ data: dias.map((d) => ({ ...base, data: new Date(`${d.data}T00:00:00Z`), minutos: d.minutos, motivo })) });
          break;
        }
      }
    });

    await auditar(u, p.aprovar ? "aprovar_solicitacao" : "recusar_solicitacao", "Solicitacao", s.id, { tipo: s.tipo, resposta: p.resposta ?? null });
    atualizar();
  });
}
