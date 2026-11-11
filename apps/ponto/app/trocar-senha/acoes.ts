"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/ponto-db";
import { usuarioAtual } from "@/lib/session";
import type { Resultado } from "@/lib/acoes";

export async function trocarSenha(atual: string, nova: string): Promise<Resultado> {
  const u = await usuarioAtual();
  if (!u) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  if (nova.length < 6) return { ok: false, erro: "A nova senha precisa ter pelo menos 6 caracteres." };

  const registro = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
  if (!(await bcrypt.compare(atual, registro.senhaHash))) return { ok: false, erro: "A senha atual não confere." };
  if (atual === nova) return { ok: false, erro: "A nova senha precisa ser diferente da atual." };

  await prisma.usuario.update({
    where: { id: u.id },
    data: { senhaHash: await bcrypt.hash(nova, 10), trocarSenha: false },
  });
  return { ok: true };
}
