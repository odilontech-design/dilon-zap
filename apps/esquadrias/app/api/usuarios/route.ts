import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { LIMITE_USUARIOS } from "@/lib/planos";
import { registrar } from "@/lib/auditoria";

export const GET = rota(async () => {
  const usuario = await usuarioDaApi();

  return ok(
    await prisma.usuario.findMany({
      where: { empresaId: usuario.empresaId, papel: { not: "SUPERADMIN" } },
      select: { id: true, nome: true, email: true, papel: true, telefone: true, comissaoPercent: true, desativadoEm: true, criadoEm: true },
      orderBy: [{ desativadoEm: "asc" }, { nome: "asc" }],
    }),
  );
});

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);

  const dados = await corpo(
    req,
    z.object({
      nome: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(160),
      senha: z.string().min(8).max(72),
      papel: z.enum(["OWNER", "GERENTE", "VENDEDOR", "PRODUCAO", "FINANCEIRO"]).default("VENDEDOR"),
      telefone: z.string().trim().max(40).nullish(),
      comissaoPercent: z.number().min(0).max(100).default(0),
    }),
  );

  // Teto do plano contado só sobre os ATIVOS: quem foi desligado não ocupa
  // vaga — senão a empresa precisaria apagar o histórico pra contratar.
  const limite = LIMITE_USUARIOS[usuario.plano];
  if (limite !== null) {
    const ativos = await prisma.usuario.count({ where: { empresaId: usuario.empresaId, desativadoEm: null, papel: { not: "SUPERADMIN" } } });
    if (ativos >= limite) {
      throw new RespostaDeErro(402, `o plano atual permite ${limite} usuários ativos. Faça upgrade para adicionar mais.`);
    }
  }

  const criado = await prisma.usuario.create({
    data: {
      empresaId: usuario.empresaId,
      nome: dados.nome,
      email: dados.email.toLowerCase(),
      senhaHash: await bcrypt.hash(dados.senha, 10),
      papel: dados.papel,
      telefone: dados.telefone ?? null,
      comissaoPercent: dados.comissaoPercent,
    },
    select: { id: true, nome: true, email: true, papel: true },
  });

  await registrar(usuario, "usuario.criado", { entidade: "Usuario", entidadeId: criado.id, detalhe: { email: criado.email, papel: criado.papel } });
  return ok(criado, 201);
});
