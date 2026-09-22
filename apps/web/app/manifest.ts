import type { MetadataRoute } from "next";

/**
 * Manifesto do app instalável na tela inicial do celular.
 *
 * Existe pelo pedido da Hemoderi: quem não fica no computador o dia todo
 * (André, Naiara) precisa ser avisado quando uma conversa é transferida pra
 * ele. No iPhone isso é mais que conveniência — o Safari só entrega
 * notificação push pra site que foi adicionado à tela de início, então sem
 * este manifesto não existe notificação nenhuma no iOS.
 *
 * display standalone: abre sem a barra do navegador, que é o que faz parecer
 * aplicativo de verdade — e é o que dispensa a loja de aplicativos.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dilon Zap",
    short_name: "Dilon Zap",
    description: "Atendimento via WhatsApp — Dilon Tech",
    start_url: "/inbox",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    lang: "pt-BR",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      // O Android recorta o ícone em círculo/quadrado arredondado; o maskable
      // tem margem sobrando pra borda não comer o logo.
      { src: "/icone-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
