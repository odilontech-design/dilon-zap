import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dilon Zap",
  description: "Atendimento via WhatsApp — Dilon Tech",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
