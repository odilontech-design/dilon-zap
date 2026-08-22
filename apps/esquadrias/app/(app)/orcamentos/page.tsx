import { requireUsuario } from "@/lib/session";
import { ListaOrcamentos } from "./lista-orcamentos";

export default async function OrcamentosPage() {
  const usuario = await requireUsuario();
  return <ListaOrcamentos papel={usuario.papel} />;
}
