import Link from "next/link";
import type { LojaPublica } from "@/lib/vitrine";
import { caminhoDaLoja } from "@/lib/vitrine-aparencia";
import { cidadeDaLoja } from "@/lib/vitrine-seo";
import { BuscaRapida } from "./busca-rapida";

const FAIXAS = [20_000, 30_000, 40_000, 50_000, 60_000, 80_000, 100_000, 150_000, 200_000];

function Icone({ nome }: { nome: "financiamento" | "troca" | "fotos" }) {
  const d = nome === "financiamento" ? "M3 10h18M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm3 8h3" : nome === "troca" ? "M7 7h11l-3-3M17 17H6l3 3" : "M4 7a2 2 0 0 1 2-2h2l1-1h6l1 1h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z";
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/**
 * A abertura da vitrine: o que a loja vende e onde, a busca rápida (a ação mais
 * comum de quem chega) e três atalhos para o que mais gera contato. Fundo escuro
 * da marca (ou o banner da loja), com um brilho na cor principal.
 */
export function Hero({ loja, menorPreco, cambios, total }: { loja: LojaPublica; menorPreco: number; cambios: string[]; total: number }) {
  const cidade = cidadeDaLoja(loja.endereco);
  const faixas = FAIXAS.filter((f) => f * 100 >= menorPreco).slice(0, 7);
  const atalhos = [
    { icone: "fotos" as const, titulo: `${total} ${total === 1 ? "veículo" : "veículos"} com fotos`, texto: "Ficha completa de cada carro", href: "#estoque" },
    { icone: "financiamento" as const, titulo: "Simule o financiamento", texto: "Sem compromisso, direto no site", href: caminhoDaLoja(loja.slug, loja.dominio, "financiamento") },
    { icone: "troca" as const, titulo: "Avaliamos o seu carro", texto: "Proposta pelo WhatsApp", href: caminhoDaLoja(loja.slug, loja.dominio, "venda-seu-carro") },
  ];
  return (
    <section className="relative isolate overflow-hidden text-white" style={{ background: "var(--loja-mais-escuro)" }}>
      {loja.temBanner ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/loja/${loja.slug}/marca/banner`} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-45" />
      ) : (
        <div className="absolute inset-0 -z-20" style={{ background: "radial-gradient(70% 90% at 88% 0%, color-mix(in srgb, var(--loja) 55%, transparent), transparent 70%), radial-gradient(50% 70% at 0% 100%, color-mix(in srgb, var(--loja2) 18%, transparent), transparent 70%)" }} />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-transparent to-black/50" />
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-8 pt-12 md:pb-12 md:pt-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--loja2)" }}>
            {loja.nome}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold leading-[1.1] tracking-tight md:text-5xl">
            Carros usados e seminovos
            {cidade && (
              <>
                {" "}
                <span style={{ color: "var(--loja2)" }}>em {cidade}</span>
              </>
            )}
          </h1>
          {loja.sobre && <p className="mt-4 max-w-2xl whitespace-pre-line text-sm text-neutral-200 md:text-base">{loja.sobre}</p>}
        </div>
        <BuscaRapida caminho={caminhoDaLoja(loja.slug, loja.dominio)} faixas={faixas} cambios={cambios} />
        <ul className="grid gap-3 md:grid-cols-3">
          {atalhos.map((a) => (
            <li key={a.titulo}>
              <Link href={a.href} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/10">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>
                  <Icone nome={a.icone} />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{a.titulo}</span>
                  <span className="block text-xs text-neutral-300">{a.texto}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
