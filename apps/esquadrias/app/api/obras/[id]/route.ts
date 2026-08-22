import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { registrar } from "@/lib/auditoria";

type Ctx = { params: { id: string } };

const schema = z.object({
  titulo: z.string().trim().min(2).max(160).optional(),
  status: z.enum(["AGUARDANDO", "MEDICAO", "PRODUCAO", "PRONTO", "INSTALACAO", "CONCLUIDA", "CANCELADA"]).optional(),
  responsavelId: z.string().trim().nullish(),
  endereco: z.string().trim().max(200).nullish(),
  cidade: z.string().trim().max(80).nullish(),
  previsaoInicio: z.string().datetime().nullish(),
  previsaoFim: z.string().datetime().nullish(),
  observacoes: z.string().trim().max(4000).nullish(),
});

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  const dados = await corpo(req, schema);

  const { count } = await prisma.obra.updateMany({
    where: { id: params.id, empresaId: usuario.empresaId },
    data: {
      ...dados,
      previsaoInicio: dados.previsaoInicio ? new Date(dados.previsaoInicio) : dados.previsaoInicio,
      previsaoFim: dados.previsaoFim ? new Date(dados.previsaoFim) : dados.previsaoFim,
      // Conclusão carimba a data uma vez só: reabrir e fechar de novo não pode
      // reescrever quando a obra ficou pronta pela primeira vez.
      ...(dados.status === "CONCLUIDA" ? { concluidaEm: new Date() } : {}),
    },
  });
  if (count === 0) throw new RespostaDeErro(404, "obra não encontrada");

  if (dados.status) await registrar(usuario, "obra.status", { entidade: "Obra", entidadeId: params.id, detalhe: { status: dados.status } });

  return ok(await prisma.obra.findUnique({ where: { id: params.id } }));
});
