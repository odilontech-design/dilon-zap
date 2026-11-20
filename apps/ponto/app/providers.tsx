"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Service worker só para o app poder ser instalado na tela inicial do
  // celular. Ele não guarda páginas em cache: ponto é dado ao vivo.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  // Sem consultar a sessão no servidor a cada vez que a janela volta ao foco
  // (padrão do NextAuth): é uma execução cobrada na Vercel sem efeito nenhum,
  // porque a sessão é relida do banco a cada página de qualquer jeito.
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
