import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi } from "@/lib/api";
import { registrar } from "@/lib/auditoria";

export const GET = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const params = new URL(req.url).searchParams;
  const status = params.get("status");
  const busca = params.get("busca")?.trim();

  const orcamentos = await prisma.orcamento.findMany({
    where: {
      empresaId: usuario.empresaId,
      ...(status ? { status: status as never } : {}),
      ...(busca
        ? {
            OR: [
              { titulo: { contains: busca, mode: "insensitive" as const } },
              { cliente: { nome: { contains: busca, mode: "insensitive" as const } } },
              ...(Number.isInteger(Number(busca)) ? [{ numero: Number(busca) }] : []),
            ],
          }
        : {}),
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      vendedor: { select: { id: true, nome: true } },
      _count: { select: { itens: true } },
    },
    orderBy: { numero: "desc" },
    take: 100,
  });

  return ok(orcamentos);
});

const schema = z.object({
  titulo: z.string().trim().min(2).max(120).default("Orçamento"),
  clienteId: z.string().trim().min(1).nullish(),
});

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const dados = await corpo(req, schema);

  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: usuario.empresaId } });

  // Numeração sequencial por empresa dentro de uma transação: sem isso, dois
  // vendedores criando orçamento ao mesmo tempo receberiam o mesmo número, e
  // o número do orçamento é o que o cliente cita no telefone.
  const orcamento = await prisma.$transaction(async (tx) => {
    const atual = await tx.empresa.update({
      where: { id: usuario.empresaId },
      data: { proximoNumeroOrcamento: { increment: 1 } },
      select: { proximoNumeroOrcamento: true },
    });

    const validoAte = new Date();
    validoAte.setDate(validoAte.getDate() + empresa.validadeOrcamentoDias);

    return tx.orcamento.create({
      data: {
        empresaId: usuario.empresaId,
        numero: atual.proximoNumeroOrcamento - 1,
        titulo: dados.titulo,
        clienteId: dados.clienteId ?? null,
        vendedorId: usuario.id,
        validoAte,
        condicoes: empresa.condicoesPadrao,
      },
    });
  });

  await registrar(usuario, "orcamento.criado", { entidade: "Orcamento", entidadeId: orcamento.id, detalhe: { numero: orcamento.numero } });

  return ok(orcamento, 201);
});
