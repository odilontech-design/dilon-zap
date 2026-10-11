import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { NegociacaoPagina } from "./negociacao-pagina";

export default async function NegociacaoPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  return <NegociacaoPagina id={params.id} userId={user.id} podeGerir={ehGerencia(user.role)} />;
}
