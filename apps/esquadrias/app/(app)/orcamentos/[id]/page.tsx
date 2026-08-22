import { notFound } from "next/navigation";
import { prisma } from "@dilon-zap/erp-db";
import { requireUsuario } from "@/lib/session";
import { vePreco } from "@/lib/papeis";
import { temRecurso } from "@/lib/planos";
import { EditorOrcamento } from "./editor-orcamento";

export const dynamic = "force-dynamic";

export default async function OrcamentoPage({ params }: { params: { id: string } }) {
  const usuario = await requireUsuario();

  // As listas de apoio (tipologias, cores, clientes) vêm daqui, no servidor, e
  // não de três fetches do navegador: são dados que mudam pouco e que a
  // janela de adicionar item precisa ter em mãos ANTES do primeiro clique.
  const [orcamento, tipologias, cores, clientes, empresa] = await Promise.all([
    prisma.orcamento.findFirst({ where: { id: params.id, empresaId: usuario.empresaId }, select: { id: true } }),
    prisma.tipologia.findMany({
      where: { empresaId: usuario.empresaId, ativa: true },
      select: {
        id: true,
        nome: true,
        categoria: true,
        desenhoSvg: true,
        larguraMinMm: true,
        larguraMaxMm: true,
        alturaMinMm: true,
        alturaMaxMm: true,
        parametros: { select: { chave: true, rotulo: true, valorPadrao: true }, orderBy: { ordem: "asc" } },
      },
      orderBy: [{ categoria: "asc" }, { nome: "asc" }],
    }),
    prisma.cor.findMany({
      where: { empresaId: usuario.empresaId, ativa: true },
      select: { id: true, nome: true, hex: true, fatorAluminio: true, fatorFerragem: true },
      orderBy: { ordem: "asc" },
    }),
    prisma.cliente.findMany({ where: { empresaId: usuario.empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.empresa.findUniqueOrThrow({ where: { id: usuario.empresaId }, select: { margemLucroPercent: true } }),
  ]);

  if (!orcamento) notFound();

  return (
    <EditorOrcamento
      orcamentoId={orcamento.id}
      tipologias={tipologias}
      cores={cores}
      clientes={clientes}
      margemPadrao={empresa.margemLucroPercent}
      mostrarCusto={vePreco(usuario.papel)}
      temPlanoCorte={temRecurso(usuario.plano, "PLANO_CORTE")}
      temFinanceiro={temRecurso(usuario.plano, "FINANCEIRO")}
    />
  );
}
