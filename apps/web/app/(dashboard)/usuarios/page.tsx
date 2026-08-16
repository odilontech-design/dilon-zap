import { requireOwner } from "@/lib/session";
import { UsersPanel } from "./users-panel";

// requireOwner redireciona atendente pro /painel. A checagem mora aqui e
// também em cada rota de API — o link some do menu pra quem não é
// responsável, mas menu escondido não é permissão.
export default async function UsuariosPage() {
  const user = await requireOwner();
  return <UsersPanel meuId={user.id} />;
}
