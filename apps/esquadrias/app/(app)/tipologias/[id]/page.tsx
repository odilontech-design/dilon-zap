import { notFound } from "next/navigation";
import { prisma } from "@dilon-zap/erp-db";
import { TituloPagina } from "@/components/ui";
import { requireDono } from "@/lib/session";
import { EditorTipologia } from "../editor-tipologia";
import { carregarOpcoes } from "../opcoes";

export const dynamic = "force-dynamic";

export default async function TipologiaPage({ params }: { params: { id: string } }) {
  const usuario = await requireDono();

  const [tipologia, opcoes] = await Promise.all([
    prisma.tipologia.findFirst({
      where: { id: params.id, empresaId: usuario.empresaId },
      include: {
        parametros: { orderBy: { ordem: "asc" } },
        pecas: { orderBy: { ordem: "asc" } },
        vidros: { orderBy: { ordem: "asc" } },
        ferragens: { orderBy: { ordem: "asc" } },
      },
    }),
    carregarOpcoes(usuario.empresaId),
  ]);

  if (!tipologia) notFound();

  return (
    <>
      <TituloPagina
        titulo={tipologia.nome}
        descricao="Alterar as fórmulas muda os PRÓXIMOS orçamentos. Os já salvos guardam a própria memória de cálculo e não mudam de valor."
      />
      <EditorTipologia
        tipologiaId={tipologia.id}
        opcoes={opcoes}
        inicial={{
          nome: tipologia.nome,
          categoria: tipologia.categoria,
          descricao: tipologia.descricao ?? "",
          linhaId: tipologia.linhaId ?? "",
          desenhoSvg: tipologia.desenhoSvg ?? "",
          larguraMinMm: tipologia.larguraMinMm,
          larguraMaxMm: tipologia.larguraMaxMm,
          alturaMinMm: tipologia.alturaMinMm,
          alturaMaxMm: tipologia.alturaMaxMm,
          parametros: tipologia.parametros.map((p) => ({ chave: p.chave, rotulo: p.rotulo, valorPadrao: p.valorPadrao })),
          pecas: tipologia.pecas.map((p) => ({
            perfilId: p.perfilId,
            descricao: p.descricao,
            corte: p.corte,
            formulaQuantidade: p.formulaQuantidade,
            formulaComprimento: p.formulaComprimento,
          })),
          vidros: tipologia.vidros.map((v) => ({
            vidroId: v.vidroId,
            descricao: v.descricao,
            formulaQuantidade: v.formulaQuantidade,
            formulaLargura: v.formulaLargura,
            formulaAltura: v.formulaAltura,
          })),
          ferragens: tipologia.ferragens.map((f) => ({
            ferragemId: f.ferragemId,
            descricao: f.descricao,
            formulaQuantidade: f.formulaQuantidade,
          })),
        }}
      />
    </>
  );
}
