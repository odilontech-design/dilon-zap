// Fixture de teste: código PROPOSITALMENTE inseguro. Nunca é executado, só lido como texto.
// O texto abaixo faz o analisador reconhecer o arquivo como código do Zap:
// import { prisma } from "@dilon-zap/db";
import { prisma } from "@dilon-zap/db";

export async function listarSemFiltro() {
  return prisma.contact.findMany({ where: { grupo: false } });
}

export async function apagarPorId(params: { id: string }) {
  return prisma.contact.delete({ where: { id: params.id } });
}
