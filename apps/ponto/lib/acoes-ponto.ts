"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@dilon-zap/ponto-db";
import { acaoDeAdmin, ErroDeAcao, type Resultado } from "@/lib/acoes";
import { auditar } from "@/lib/auditoria";
import { localParaUtc, somarDias, hojeNoFuso } from "@/lib/datas";
import type { UsuarioAtual } from "@/lib/session";

/**
 * Ajustes manuais do ponto. Nenhum deles altera a marcação original: incluir e
 * desconsiderar são tratamentos com motivo e autor; desfazer um ajuste marca o
 * tratamento como revogado, e o rastro fica.
 */

const motivo = z.string().trim().min(3, "Informe o motivo do ajuste").max(300);
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM)");

async function colaboradorDaEmpresa(u: UsuarioAtual, id: string) {
  const c = await prisma.colaborador.findFirst({ where: { id, empresaId: u.empresaId } });
  if (!c) throw new ErroDeAcao("Colaborador não encontrado.");
  return c;
}

function atualizar() {
  revalidatePath("/ponto");
  revalidatePath("/painel");
}

export async function incluirMarcacao(entrada: {
  colaboradorId: string;
  data: string;
  hora: string;
  diaSeguinte: boolean;
  motivo: string;
}): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const p = z.object({ colaboradorId: z.string(), data, hora, diaSeguinte: z.boolean(), motivo }).parse(entrada);
    await colaboradorDaEmpresa(u, p.colaboradorId);
    const dia = p.diaSeguinte ? somarDias(p.data, 1) : p.data;
    const instante = localParaUtc(dia, p.hora, u.empresa.timezone);
    if (instante.getTime() > Date.now()) throw new ErroDeAcao("Não dá para incluir marcação no futuro.");

    const t = await prisma.tratamento.create({
      data: {
        empresaId: u.empresaId,
        colaboradorId: p.colaboradorId,
        tipo: "INCLUSAO",
        instante,
        motivo: p.motivo,
        autorId: u.id,
        autorNome: u.nome,
      },
    });
    await auditar(u, "incluir_marcacao", "Tratamento", t.id, { colaboradorId: p.colaboradorId, dia, hora: p.hora, motivo: p.motivo });
    atualizar();
  });
}

export async function desconsiderarMarcacao(entrada: { marcacaoId: string; motivo: string }): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const p = z.object({ marcacaoId: z.string(), motivo }).parse(entrada);
    const m = await prisma.marcacao.findFirst({ where: { id: p.marcacaoId, empresaId: u.empresaId } });
    if (!m) throw new ErroDeAcao("Marcação não encontrada.");
    const ja = await prisma.tratamento.findFirst({ where: { marcacaoId: m.id, tipo: "DESCONSIDERACAO", revogadoEm: null } });
    if (ja) throw new ErroDeAcao("Esta marcação já está desconsiderada.");

    const t = await prisma.tratamento.create({
      data: {
        empresaId: u.empresaId,
        colaboradorId: m.colaboradorId,
        tipo: "DESCONSIDERACAO",
        marcacaoId: m.id,
        motivo: p.motivo,
        autorId: u.id,
        autorNome: u.nome,
      },
    });
    await auditar(u, "desconsiderar_marcacao", "Tratamento", t.id, { nsr: m.nsr, motivo: p.motivo });
    atualizar();
  });
}

export async function desfazerTratamento(tratamentoId: string): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const t = await prisma.tratamento.findFirst({ where: { id: tratamentoId, empresaId: u.empresaId, revogadoEm: null } });
    if (!t) throw new ErroDeAcao("Ajuste não encontrado.");
    await prisma.tratamento.update({ where: { id: t.id }, data: { revogadoEm: new Date(), revogadoPor: u.nome } });
    await auditar(u, "desfazer_ajuste", "Tratamento", t.id, { tipo: t.tipo });
    atualizar();
  });
}

export async function abonar(entrada: { colaboradorId: string; data: string; minutos: number; motivo: string }): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const p = z
      .object({ colaboradorId: z.string(), data, minutos: z.number().int().min(1).max(24 * 60), motivo })
      .parse(entrada);
    await colaboradorDaEmpresa(u, p.colaboradorId);
    if (p.data > hojeNoFuso(u.empresa.timezone)) throw new ErroDeAcao("Abono só para hoje ou dias passados.");
    const a = await prisma.abono.create({
      data: {
        empresaId: u.empresaId,
        colaboradorId: p.colaboradorId,
        data: new Date(`${p.data}T00:00:00Z`),
        minutos: p.minutos,
        motivo: p.motivo,
        autorId: u.id,
        autorNome: u.nome,
      },
    });
    await auditar(u, "abonar", "Abono", a.id, { colaboradorId: p.colaboradorId, data: p.data, minutos: p.minutos, motivo: p.motivo });
    atualizar();
  });
}

export async function desfazerAbono(abonoId: string): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const a = await prisma.abono.findFirst({ where: { id: abonoId, empresaId: u.empresaId, revogadoEm: null } });
    if (!a) throw new ErroDeAcao("Abono não encontrado.");
    await prisma.abono.update({ where: { id: a.id }, data: { revogadoEm: new Date() } });
    await auditar(u, "desfazer_abono", "Abono", a.id);
    atualizar();
  });
}
