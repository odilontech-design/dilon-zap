"use server";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@dilon-zap/ponto-db";
import { acaoDeAdmin, ErroDeAcao, type Resultado } from "@/lib/acoes";
import { auditar } from "@/lib/auditoria";
import { cpfValido, soDigitos } from "@/lib/documentos";
import { cabeMais, PLANOS } from "@/lib/planos";
import type { UsuarioAtual } from "@/lib/session";

const schema = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(3, "Informe o nome completo").max(120),
  cpf: z.string(),
  pis: z.string().optional(),
  matricula: z.string().trim().max(30).optional(),
  cargo: z.string().trim().max(80).optional(),
  admissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de admissão"),
  jornadaId: z.string().min(1, "Escolha a jornada"),
  modoRegistro: z.enum(["SIMPLES", "COM_FOTO"]),
});

/** Senha provisória fácil de ditar por telefone: 6 dígitos. Troca obrigatória no 1º acesso. */
function senhaProvisoria(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function conferirLimite(u: UsuarioAtual) {
  const limite = PLANOS[u.empresa.plano].maxColaboradores;
  const ativos = await prisma.colaborador.count({ where: { empresaId: u.empresaId, ativo: true } });
  if (!cabeMais(limite, ativos)) {
    throw new ErroDeAcao(
      `O plano ${PLANOS[u.empresa.plano].nome} vai até ${limite} colaboradores ativos. Para o ${limite! + 1}º, mude para o plano Ponto.`,
    );
  }
}

export async function salvarColaborador(entrada: z.input<typeof schema>): Promise<Resultado<{ login: string; senha: string } | null>> {
  return acaoDeAdmin(async (u) => {
    const p = schema.parse(entrada);
    const cpf = soDigitos(p.cpf);
    if (!cpfValido(cpf)) throw new ErroDeAcao("CPF inválido. Confira os números.");
    const jornada = await prisma.jornada.findFirst({ where: { id: p.jornadaId, empresaId: u.empresaId } });
    if (!jornada) throw new ErroDeAcao("Jornada não encontrada.");

    const dados = {
      nome: p.nome,
      cpf,
      pis: p.pis ? soDigitos(p.pis) || null : null,
      matricula: p.matricula || null,
      cargo: p.cargo || null,
      admissao: new Date(`${p.admissao}T00:00:00Z`),
      jornadaId: p.jornadaId,
      modoRegistro: p.modoRegistro,
    };

    if (p.id) {
      const atual = await prisma.colaborador.findFirst({ where: { id: p.id, empresaId: u.empresaId }, include: { usuario: true } });
      if (!atual) throw new ErroDeAcao("Colaborador não encontrado.");
      await prisma.$transaction(async (tx) => {
        await tx.colaborador.update({ where: { id: p.id }, data: dados });
        // O login do colaborador é o CPF: se o CPF foi corrigido, o login acompanha.
        if (atual.usuario && atual.usuario.papel === "COLABORADOR") {
          await tx.usuario.update({ where: { id: atual.usuario.id }, data: { login: cpf, nome: p.nome } });
        }
      });
      await auditar(u, "editar_colaborador", "Colaborador", p.id, { ...dados, admissao: p.admissao });
      revalidatePath("/colaboradores");
      return null;
    }

    await conferirLimite(u);
    if (await prisma.usuario.findUnique({ where: { login: cpf } })) {
      throw new ErroDeAcao("Já existe um acesso com este CPF.");
    }
    const senha = senhaProvisoria();
    const senhaHash = await bcrypt.hash(senha, 10);
    const c = await prisma.$transaction(async (tx) => {
      const novo = await tx.colaborador.create({ data: { ...dados, empresaId: u.empresaId } });
      await tx.usuario.create({
        data: { empresaId: u.empresaId, nome: p.nome, login: cpf, senhaHash, papel: "COLABORADOR", trocarSenha: true, colaboradorId: novo.id },
      });
      return novo;
    });
    await auditar(u, "cadastrar_colaborador", "Colaborador", c.id, { nome: p.nome });
    revalidatePath("/colaboradores");
    revalidatePath("/painel");
    return { login: cpf, senha };
  });
}

export async function novaSenha(colaboradorId: string): Promise<Resultado<{ login: string; senha: string }>> {
  return acaoDeAdmin(async (u) => {
    const c = await prisma.colaborador.findFirst({ where: { id: colaboradorId, empresaId: u.empresaId }, include: { usuario: true } });
    if (!c?.usuario) throw new ErroDeAcao("Colaborador sem acesso.");
    const senha = senhaProvisoria();
    await prisma.usuario.update({ where: { id: c.usuario.id }, data: { senhaHash: await bcrypt.hash(senha, 10), trocarSenha: true } });
    await auditar(u, "nova_senha_colaborador", "Colaborador", c.id);
    return { login: c.usuario.login, senha };
  });
}

export async function desligar(colaboradorId: string, data: string): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroDeAcao("Informe a data do desligamento.");
    const c = await prisma.colaborador.findFirst({ where: { id: colaboradorId, empresaId: u.empresaId } });
    if (!c) throw new ErroDeAcao("Colaborador não encontrado.");
    // Desligar não apaga nada: as marcações ficam guardadas (prazo legal de 5 anos).
    await prisma.colaborador.update({ where: { id: c.id }, data: { ativo: false, desligadoEm: new Date(`${data}T00:00:00Z`) } });
    await auditar(u, "desligar_colaborador", "Colaborador", c.id, { data });
    revalidatePath("/colaboradores");
  });
}

export async function reativar(colaboradorId: string): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const c = await prisma.colaborador.findFirst({ where: { id: colaboradorId, empresaId: u.empresaId } });
    if (!c) throw new ErroDeAcao("Colaborador não encontrado.");
    await conferirLimite(u);
    await prisma.colaborador.update({ where: { id: c.id }, data: { ativo: true, desligadoEm: null } });
    await auditar(u, "reativar_colaborador", "Colaborador", c.id);
    revalidatePath("/colaboradores");
  });
}
