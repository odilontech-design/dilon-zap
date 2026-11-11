"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@dilon-zap/ponto-db";
import { feriadosNacionais } from "@dilon-zap/ponto-core";
import { cnpjValido, soDigitos } from "@/lib/documentos";
import { hojeNoFuso } from "@/lib/datas";
import type { Resultado } from "@/lib/acoes";
import { iniciarCobranca } from "@/lib/cobranca";

const schema = z.object({
  razaoSocial: z.string().trim().min(3, "Informe a razão social"),
  cnpj: z.string(),
  nome: z.string().trim().min(3, "Informe o seu nome"),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  senha: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres"),
  aceite: z.literal(true, { errorMap: () => ({ message: "É preciso aceitar os termos" }) }),
});

/**
 * Contratação do Essencial: cria a empresa, o administrador e os feriados
 * nacionais deste ano e do próximo, tudo numa transação. O acesso já sai
 * liberado (é o que o plano promete) e logo depois a assinatura por boleto é
 * criada no Asaas, com o primeiro vencimento em poucos dias.
 */
export async function criarConta(dados: z.input<typeof schema>): Promise<Resultado> {
  if (process.env.PONTO_CADASTRO_FECHADO === "1") return { ok: false, erro: "Contratação pelo site pausada." };

  const p = schema.safeParse(dados);
  if (!p.success) return { ok: false, erro: p.error.errors[0]?.message ?? "Dados inválidos" };
  const cnpj = soDigitos(p.data.cnpj);
  if (!cnpjValido(cnpj)) return { ok: false, erro: "CNPJ inválido. Confira os números." };

  if (await prisma.empresa.findUnique({ where: { cnpj } })) {
    return { ok: false, erro: "Este CNPJ já tem conta. Entre com o email do administrador." };
  }
  if (await prisma.usuario.findUnique({ where: { login: p.data.email } })) {
    return { ok: false, erro: "Este email já está em uso." };
  }

  const ano = Number(hojeNoFuso("America/Sao_Paulo").slice(0, 4));
  const senhaHash = await bcrypt.hash(p.data.senha, 10);

  const empresa = await prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.create({
      data: { razaoSocial: p.data.razaoSocial, cnpj, plano: "ESSENCIAL", emailCobranca: p.data.email },
    });
    await tx.usuario.create({
      data: { empresaId: empresa.id, nome: p.data.nome, login: p.data.email, senhaHash, papel: "ADMIN" },
    });
    await tx.feriado.createMany({
      data: [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)].map((f) => ({
        empresaId: empresa.id,
        data: new Date(`${f.data}T00:00:00Z`),
        nome: f.nome,
      })),
    });
    return empresa;
  });

  // O acesso já está liberado. O boleto sai em seguida; se o Asaas falhar, a
  // conta continua de pé e a tela de assinatura oferece gerar de novo.
  await iniciarCobranca(empresa.id);
  return { ok: true };
}
