import { TituloPagina } from "@/components/ui";
import { requireDono } from "@/lib/session";
import { EditorTipologia, TIPOLOGIA_VAZIA } from "../editor-tipologia";
import { carregarOpcoes } from "../opcoes";

export const dynamic = "force-dynamic";

export default async function NovaTipologiaPage() {
  const usuario = await requireDono();
  const opcoes = await carregarOpcoes(usuario.empresaId);

  return (
    <>
      <TituloPagina
        titulo="Nova tipologia"
        descricao="Escreva as fórmulas de corte da sua montagem. Use L (largura), H (altura) e os parâmetros que você criar."
      />
      <EditorTipologia inicial={TIPOLOGIA_VAZIA} opcoes={opcoes} />
    </>
  );
}
