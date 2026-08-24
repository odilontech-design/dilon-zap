import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Esquadrias — gestão para vidraçarias e serralherias",
  description: "Orçamento paramétrico, plano de corte, relação de materiais e financeiro para vidros, esquadrias de alumínio e serralheria de ferro.",
};

/**
 * O tema é aplicado por um script INLINE antes da hidratação. Ler o
 * localStorage num useEffect faria a tela nascer clara e piscar pra escura em
 * toda navegação — e quem trabalha com este sistema o dia inteiro nota.
 */
const APLICAR_TEMA = `
try {
  var t = localStorage.getItem("tema");
  if (!t) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APLICAR_TEMA }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
