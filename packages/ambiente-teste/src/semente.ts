import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/db";
import { confirmarServidor, type IdentidadeEsperada } from "./guarda-banco";

/**
 * Dados fictícios do banco local. Só a empresa "Dilon Tech (local)" tem o SDR.
 * A "Outra Empresa" existe apenas nos testes, para provar o isolamento entre
 * duas empresas que tenham o recurso.
 */

export const USUARIOS = {
  dono: "dono@dilontech.teste",
  financeiro: "financeiro@dilontech.teste",
  atendente: "atendente@dilontech.teste",
  superadmin: "suporte@dilontech.teste",
  desativado: "desativado@dilontech.teste",
  externo: "dono@externa.teste",
  outro: "dono@outra.teste",
} as const;

export const SLUGS = { dilon: "dilon-tech-local", externa: "empresa-externa-local", outra: "outra-empresa-local" } as const;

export async function semear(senha: string, opcoes: { outraEmpresaComSdr: boolean } & IdentidadeEsperada) {
  // Toda operação de banco passa pela guarda, inclusive esta.
  const v = await confirmarServidor((sql) => prisma.$queryRawUnsafe(sql), opcoes);
  if (!v.ok) throw new Error(`servidor recusado: ${v.motivo}`);

  const passwordHash = await bcrypt.hash(senha, 4);
  const usuario = (tenantId: string, email: string, name: string, role: "OWNER" | "AGENT" | "FINANCEIRO" | "SUPERADMIN", extras = {}) =>
    prisma.user.create({ data: { tenantId, email, name, role, passwordHash, ...extras } });

  const dilon = await prisma.tenant.create({ data: { name: "Dilon Tech (local)", slug: SLUGS.dilon } });
  await prisma.tenantRecurso.create({ data: { tenantId: dilon.id, recurso: "SDR", ativo: true, motivo: "Validação local do SDR" } });
  await usuario(dilon.id, USUARIOS.dono, "Dono Teste", "OWNER");
  await usuario(dilon.id, USUARIOS.financeiro, "Financeiro Teste", "FINANCEIRO");
  await usuario(dilon.id, USUARIOS.atendente, "Atendente Teste", "AGENT");
  await usuario(dilon.id, USUARIOS.superadmin, "Suporte Teste", "SUPERADMIN");
  await usuario(dilon.id, USUARIOS.desativado, "Desativado Teste", "OWNER", { deactivatedAt: new Date() });

  // Plataforma completa de propósito: a regra antiga não pode entregar o SDR.
  const externa = await prisma.tenant.create({
    data: {
      name: "Empresa Externa (local)",
      slug: SLUGS.externa,
      subscription: { create: { amountCents: 0, cycleDay: 10, plano: "ESCALA", plataformaCompleta: true } },
    },
  });
  await usuario(externa.id, USUARIOS.externo, "Dono Externo", "OWNER");

  if (opcoes.outraEmpresaComSdr) {
    const outra = await prisma.tenant.create({ data: { name: "Outra Empresa (local)", slug: SLUGS.outra } });
    await prisma.tenantRecurso.create({ data: { tenantId: outra.id, recurso: "SDR", ativo: true, motivo: "Só para o teste de isolamento" } });
    await usuario(outra.id, USUARIOS.outro, "Dono Outra", "OWNER");
  }
}
