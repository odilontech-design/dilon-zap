import { requireUsuario } from "@/lib/session";
import { ListaOrcamentos } from "./lista-orcamentos";

// Página atrás de autenticação: o conteúdo depende da sessão de quem pediu, e
// por isso nunca pode ser gerada estaticamente no build. Sem esta linha o Next
// tenta pré-renderizar, e a compilação passa a depender das variáveis de
// autenticação estarem certas no ambiente de BUILD — um NEXTAUTH_URL vazio
// derruba o deploy inteiro com "Invalid URL", em vez de simplesmente falhar o
// login em runtime.
export const dynamic = "force-dynamic";

export default async function OrcamentosPage() {
  const usuario = await requireUsuario();
  return <ListaOrcamentos papel={usuario.papel} />;
}
