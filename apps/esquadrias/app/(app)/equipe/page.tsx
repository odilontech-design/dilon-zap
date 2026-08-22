import { requireDono } from "@/lib/session";
import { LIMITE_USUARIOS, NOME_PLANO } from "@/lib/planos";
import { PainelEquipe } from "./painel-equipe";

// Página atrás de autenticação: o conteúdo depende da sessão de quem pediu, e
// por isso nunca pode ser gerada estaticamente no build. Sem esta linha o Next
// tenta pré-renderizar, e a compilação passa a depender das variáveis de
// autenticação estarem certas no ambiente de BUILD — um NEXTAUTH_URL vazio
// derruba o deploy inteiro com "Invalid URL", em vez de simplesmente falhar o
// login em runtime.
export const dynamic = "force-dynamic";

export default async function EquipePage() {
  const usuario = await requireDono();
  const limite = LIMITE_USUARIOS[usuario.plano];

  return <PainelEquipe limite={limite} nomePlano={NOME_PLANO[usuario.plano]} meuId={usuario.id} />;
}
