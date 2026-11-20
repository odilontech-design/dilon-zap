import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dilon Ponto",
  description: "Controle de ponto pelo celular e pelo computador, com o mês calculado sozinho.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icone.svg", apple: "/icone.svg" },
  appleWebApp: { capable: true, title: "Ponto", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#C75E06",
  width: "device-width",
  initialScale: 1,
};

// Tema aplicado antes da hidratação (ver apps/esquadrias/app/layout.tsx).
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
