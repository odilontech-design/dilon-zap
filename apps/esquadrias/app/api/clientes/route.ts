import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi } from "@/lib/api";
import { schemaCliente } from "@/lib/schemas";

export const GET = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const busca = new URL(req.url).searchParams.get("busca")?.trim();

  const clientes = await prisma.cliente.findMany({
    where: {
      empresaId: usuario.empresaId,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" as const } },
              { documento: { contains: busca.replace(/\D/g, "") || busca } },
              { telefone: { contains: busca } },
            ],
          }
        : {}),
    },
    orderBy: { nome: "asc" },
    take: 200,
  });

  return ok(clientes);
});

/** Documento entra só com dígitos: "123.456.789-01" e "12345678901" são a
 *  mesma pessoa, e sem normalizar o mesmo cliente entra duas vezes. */
function normalizar(dados: z.infer<typeof schemaCliente>) {
  return {
    ...dados,
    documento: dados.documento?.replace(/\D/g, "") || null,
    email: dados.email || null,
  };
}

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const dados = await corpo(req, schemaCliente);

  const criado = await prisma.cliente.create({
    data: { ...normalizar(dados), empresaId: usuario.empresaId },
  });

  return ok(criado, 201);
});
