"use client";

import { registrarContato } from "./rastreio";
import { IconeWhatsapp } from "./comum";

/**
 * O botão flutuante do WhatsApp, em todas as páginas da loja: é o caminho mais
 * curto entre "gostei" e "falei com a loja". Conta o clique como contato. Na
 * página do carro, no celular, sobe para não cobrir a barra "Tenho interesse".
 */
export function BotaoFlutuante({ href, subirNoCelular = false }: { href: string; subirNoCelular?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
      onClick={() => registrarContato("whatsapp")}
      className={`group fixed right-4 z-30 flex items-center gap-2 rounded-full bg-[#25D366] p-3.5 text-white shadow-xl shadow-black/25 transition hover:scale-105 md:right-6 md:px-5 md:py-3.5 ${subirNoCelular ? "hidden bottom-6 md:flex" : "bottom-5 md:bottom-6"}`}
    >
      <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#25D366] opacity-30 [animation-duration:2.5s]" aria-hidden />
      <IconeWhatsapp className="h-7 w-7" />
      <span className="hidden text-sm font-semibold md:inline">Fale com a gente</span>
    </a>
  );
}
