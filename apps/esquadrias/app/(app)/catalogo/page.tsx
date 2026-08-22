import { requireUsuario } from "@/lib/session";
import { podeEditarCatalogo } from "@/lib/papeis";
import { PainelCatalogo } from "./painel-catalogo";

// Página atrás de autenticação: o conteúdo depende da sessão de quem pediu, e
// por isso nunca pode ser gerada estaticamente no build. Sem esta linha o Next
// tenta pré-renderizar, e a compilação passa a depender das variáveis de
// autenticação estarem certas no ambiente de BUILD — um NEXTAUTH_URL vazio
// derruba o deploy inteiro com "Invalid URL", em vez de simplesmente falhar o
// login em runtime.
export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const usuario = await requireUsuario();
  return <PainelCatalogo editavel={podeEditarCatalogo(usuario.papel)} />;
}
