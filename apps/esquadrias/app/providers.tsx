"use client";

import { SessionProvider } from "next-auth/react";
import { SWRConfig } from "swr";

/**
 * Sem busca automática ao voltar para a aba.
 *
 * Por padrão, o SessionProvider consulta a sessão no servidor e o SWR busca
 * de novo todas as listas da tela a cada vez que a janela volta ao foco. Quem
 * alterna o dia todo entre o WhatsApp e o sistema gerava dezenas de execuções
 * por hora sem mudar nada na tela (no Catálogo, 5 de uma vez), e na Vercel
 * cada uma é cobrada. Depois de salvar algo, o `mutate()` de cada tela
 * continua atualizando na hora; recarregar a página também.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 10_000 }}>{children}</SWRConfig>
    </SessionProvider>
  );
}
