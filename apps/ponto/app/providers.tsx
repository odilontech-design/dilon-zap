"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Service worker só para o app poder ser instalado na tela inicial do
  // celular. Ele não guarda páginas em cache: ponto é dado ao vivo.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return <SessionProvider>{children}</SessionProvider>;
}
