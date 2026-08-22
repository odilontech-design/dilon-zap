import { requireUsuario } from "@/lib/session";
import { podeEditarCatalogo } from "@/lib/papeis";
import { PainelCatalogo } from "./painel-catalogo";

export default async function CatalogoPage() {
  const usuario = await requireUsuario();
  return <PainelCatalogo editavel={podeEditarCatalogo(usuario.papel)} />;
}
