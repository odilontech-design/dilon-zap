import { requireDono } from "@/lib/session";
import { LIMITE_USUARIOS, NOME_PLANO } from "@/lib/planos";
import { PainelEquipe } from "./painel-equipe";

export default async function EquipePage() {
  const usuario = await requireDono();
  const limite = LIMITE_USUARIOS[usuario.plano];

  return <PainelEquipe limite={limite} nomePlano={NOME_PLANO[usuario.plano]} meuId={usuario.id} />;
}
