import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";

type Ctx = { params: { id: string } };

const schema = z.object({
  nome: z.string().trim().min(2).max(160).optional(),
  tipo: z.enum(["FISICA", "JURIDICA"]).optional(),
  documento: z.string().trim().max(20).nullish(),
  email: z.string().trim().max(160).nullish(),
  telefone: z.string().trim().max(40).nullish(),
  endereco: z.string().trim().max(200).nullish(),
  numero: z.string().trim().max(20).nullish(),
  bairro: z.string().trim().max(80).nullish(),
  cidade: z.string().trim().max(80).nullish(),
  uf: z.string().trim().max(2).nullish(),
  cep: z.string().trim().max(12).nullish(),
  observacoes: z.string().trim().max(2000).nullish(),
});

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  const dados = await corpo(req, schema);

  // updateMany com o empresaId no where, e não update por id: o id vem da URL
  // e um usuário poderia mandar o id de um cliente de outra empresa. Com o
  // filtro no where, a atualização simplesmente não encontra nada.
  const { count } = await prisma.cliente.updateMany({
    where: { id: params.id, empresaId: usuario.empresaId },
    data: { ...dados, documento: dados.documento ? dados.documento.replace(/\D/g, "") : dados.documento },
  });
  if (count === 0) throw new RespostaDeErro(404, "cliente não encontrado");

  return ok(await prisma.cliente.findUnique({ where: { id: params.id } }));
});

export const DELETE = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();

  const orcamentos = await prisma.orcamento.count({ where: { clienteId: params.id, empresaId: usuario.empresaId } });
  // Cliente com histórico não é apagado: sumir com ele levaria junto a
  // rastreabilidade de quem comprou o quê. A tela oferece arquivar, não
  // excluir, quando existe orçamento.
  if (orcamentos > 0) throw new RespostaDeErro(409, `cliente tem ${orcamentos} orçamento(s) e não pode ser excluído`);

  const { count } = await prisma.cliente.deleteMany({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (count === 0) throw new RespostaDeErro(404, "cliente não encontrado");

  return ok({ ok: true });
});
