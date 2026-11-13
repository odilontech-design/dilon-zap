"use client";

import Link from "next/link";
import type { CarroPublico } from "@/lib/vitrine";
import { FotoSemCortes } from "@/components/foto-sem-cortes";
import { brl, fotoSrcSet, fotoUrl, IconeWhatsapp, whatsappLink } from "./comum";
import { registrarContato } from "./rastreio";

/**
 * O cartão do carro (lista, páginas de marca e "carros parecidos"). O cartão
 * inteiro leva à página do carro (o link do título se estende por cima); o botão
 * do WhatsApp fica acima dele e abre a conversa já falando do carro.
 */
export function CartaoDeCarro({ slug, c, whatsapp, baseUrl, novidade = false }: { slug: string; c: CarroPublico; whatsapp: string | null; baseUrl: string; novidade?: boolean }) {
  const href = `/loja/${slug}/${c.id}`;
  const nome = `${c.marca} ${c.modelo} ${c.versao ?? ""}`.replace(/\s+/g, " ").trim();
  const zap = whatsapp ? whatsappLink(whatsapp, `Olá! Tenho interesse no ${nome} ${c.anoFabricacao}/${c.anoModelo} que vi no site: ${baseUrl}/${c.id}`) : null;
  const chips = [`${c.anoFabricacao}/${c.anoModelo}`, c.kmInformado ? `${c.km.toLocaleString("pt-BR")} km` : null, c.cambio, c.combustivel].filter(Boolean) as string[];
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-square overflow-hidden bg-neutral-100">
        {c.fotos[0] ? (
          <FotoSemCortes
            src={fotoUrl(slug, c.fotos[0].id, 800)}
            fundo={fotoUrl(slug, c.fotos[0].id, 240)}
            srcSet={fotoSrcSet(slug, c.fotos[0].id, [480, 800, 1200])}
            sizes="(min-width:1024px) 360px, (min-width:640px) 50vw, 100vw"
            alt={`${nome} ${c.anoModelo}`}
            className="transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">Fotos em breve</div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          {c.status === "RESERVADO" && <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-white shadow">Reservado</span>}
          {c.status !== "RESERVADO" && novidade && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold shadow" style={{ background: "var(--loja2)", color: "var(--loja2-texto)" }}>
              Novidade
            </span>
          )}
        </div>
        {c.fotos.length > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-2 py-0.5 text-[11px] text-white">{c.fotos.length} fotos</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">{c.marca}</p>
        <h3 className="font-semibold leading-snug">
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {c.modelo} {c.versao ?? ""}
          </Link>
        </h3>
        <div className="flex flex-wrap gap-1.5 text-xs text-neutral-600">
          {chips.map((t) => (
            <span key={t} className="rounded-md bg-neutral-100 px-2 py-1">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <p className="text-2xl font-extrabold tracking-tight">{brl(c.precoCents)}</p>
            <p className="text-xs font-medium opacity-0 transition group-hover:opacity-100" style={{ color: "var(--loja)" }}>
              Ver detalhes →
            </p>
          </div>
          {zap && (
            <a
              href={zap}
              target="_blank"
              rel="noreferrer"
              aria-label={`Chamar no WhatsApp sobre o ${nome}`}
              onClick={() => registrarContato("whatsapp", c.precoCents)}
              className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow hover:opacity-90"
            >
              <IconeWhatsapp className="h-6 w-6" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
