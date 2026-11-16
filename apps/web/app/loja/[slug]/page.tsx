import { caminhoDaLoja } from "@/lib/vitrine-aparencia";
import { BuscaClassica } from "./busca-classica";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseDaLoja, carrosDaVitrine, linkDaLoja, linkDoCarro, lojaPublica } from "@/lib/vitrine";
import { CascaDaLoja } from "./casca";
import { carroParaJsonLd, JsonLd } from "./dados-estruturados";
import { Suspense } from "react";
import Link from "next/link";
import { Hero } from "./hero";
import { CarrosselDeBanners } from "./carrossel-banners";
import { OfertaAoEntrar } from "./oferta-ao-entrar";
import { CartaoDeCarro } from "./cartao-de-carro";
import { bannersDaLoja, completarDestaques, carrosEmDestaque } from "@/lib/meu-site";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import { FaixaDeMarcas } from "./marcas";
import { ListaDeCarros } from "./lista-de-carros";
import { cidadeDaLoja, gruposDoEstoque } from "@/lib/vitrine-seo";

/**
 * Vitrine pública da revenda. Sem login: é a página que a loja põe na bio do
 * Instagram e manda no WhatsApp. Fora do (dashboard) para não carregar menu
 * nem exigir sessão.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const loja = await lojaPublica(params.slug);
  if (!loja) return { title: "Loja não encontrada" };
  const descricao = loja.sobre?.slice(0, 160) || `Veículos à venda na ${loja.nome}.`;
  return {
    title: { absolute: `${loja.nome} · Carros seminovos e usados à venda` },
    description: descricao,
    robots: { index: true, follow: true, "max-image-preview": "large" },
    openGraph: { siteName: loja.nome, locale: "pt_BR", title: `${loja.nome} · Veículos à venda`, description: descricao, url: linkDaLoja(loja.slug, loja.dominio), type: "website" },
    alternates: { canonical: linkDaLoja(loja.slug, loja.dominio) },
  };
}

export default async function LojaPage({ params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) notFound();
  const [carros, banners] = await Promise.all([carrosDaVitrine(loja), bannersDaLoja(loja.tenantId)]);
  const aVenda = carros.filter((c) => c.status === "DISPONIVEL");
  const destaques = completarDestaques(carrosEmDestaque(loja.destaques, aVenda), [...aVenda].sort((a, b) => +new Date(b.entradaEm) - +new Date(a.entradaEm)));
  const oferta = loja.ofertaVeiculoId ? carros.find((c) => c.id === loja.ofertaVeiculoId && c.status === "DISPONIVEL") ?? null : null;
  const baseDosCarros = `${baseDaLoja(loja.dominio)}/loja/${loja.slug}`;

  const urlDaLoja = linkDaLoja(loja.slug, loja.dominio);
  return (
    <CascaDaLoja loja={loja} aba="vitrine">
      <JsonLd
        dados={{
          "@context": "https://schema.org",
          "@type": "AutoDealer",
          name: loja.nome,
          url: urlDaLoja,
          ...(loja.enderecoPartes.cidade
            ? { address: { "@type": "PostalAddress", streetAddress: loja.enderecoPartes.logradouro ?? undefined, addressLocality: loja.enderecoPartes.cidade, addressRegion: loja.enderecoPartes.uf ?? undefined, postalCode: loja.enderecoPartes.cep ?? undefined, addressCountry: "BR" } }
            : loja.endereco
              ? { address: loja.endereco }
              : {}),
          ...(loja.telefones[0] ? { telephone: `+${loja.telefones[0].numero}` } : loja.whatsapp ? { telephone: `+${loja.whatsapp}` } : {}),
          ...(loja.temLogo ? { image: `${baseDaLoja(loja.dominio)}/api/loja/${loja.slug}/marca/logo` } : {}),
          ...(loja.horario.length ? { openingHours: loja.horario } : {}),
          ...(loja.instagram || loja.facebook ? { sameAs: [loja.instagram, loja.facebook].filter(Boolean) } : {}),
          makesOffer: carros.slice(0, 50).map((c) => ({ "@type": "Offer", price: (c.precoCents / 100).toFixed(2), priceCurrency: "BRL", itemOffered: carroParaJsonLd(c, linkDoCarro(loja.slug, c.id, loja.dominio), []) })),
        }}
      />
      <CarrosselDeBanners slug={loja.slug} banners={banners.map((b) => ({ id: b.id, titulo: b.titulo, link: b.link, temCelular: !!b.chaveCelular }))} />
      {loja.estiloSite === "classico" ? (
        <BuscaClassica caminho={caminhoDaLoja(loja.slug, loja.dominio)} carros={carros.map((c) => ({ marca: c.marca, modelo: c.modelo, anoModelo: c.anoModelo, precoCents: c.precoCents }))} />
      ) : (
      <Hero compacto={banners.length > 0} loja={loja} menorPreco={carros.length ? Math.min(...carros.map((c) => c.precoCents)) : 0} cambios={[...new Set(carros.map((c) => c.cambio).filter(Boolean) as string[])].sort()} total={carros.length} />
      )}
      {destaques.length > 0 && (
        <section aria-label="Últimas ofertas" className="mx-auto w-full max-w-6xl px-4 pt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-xl font-bold tracking-tight md:text-2xl">Últimas ofertas</h2>
            <a href="#estoque" className="text-sm font-medium hover:underline" style={{ color: "var(--loja)" }}>Ver todo o estoque →</a>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {destaques.map((c) => <CartaoDeCarro key={c.id} slug={loja.slug} c={c} whatsapp={loja.whatsapp} baseUrl={baseDosCarros} />)}
          </div>
        </section>
      )}
      <FaixaDeMarcas slug={loja.slug} grupos={gruposDoEstoque(carros)} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Suspense>
          <ListaDeCarros slug={loja.slug} carros={carros} whatsapp={loja.whatsapp} baseUrl={baseDosCarros} />
        </Suspense>
        {gruposDoEstoque(carros).length > 0 && (
          <nav aria-label="Procurar por marca e modelo" className="mt-10 border-t border-neutral-200 pt-6">
            <h2 className="text-sm font-semibold">Carros usados{cidadeDaLoja(loja.endereco) ? ` em ${cidadeDaLoja(loja.endereco)}` : ""} por marca e modelo</h2>
            <ul className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {gruposDoEstoque(carros).map((g) => (
                <li key={g.marcaSlug} className="text-sm">
                  <Link href={`/loja/${loja.slug}/marca/${g.marcaSlug}`} className="font-medium hover:underline">{g.marca} ({g.n})</Link>
                  <span className="text-neutral-500">
                    {" "}
                    {g.modelos.slice(0, 6).map((m, i) => (
                      <span key={m.modeloSlug}>{i > 0 ? " · " : ""}<Link href={`/loja/${loja.slug}/marca/${g.marcaSlug}/${m.modeloSlug}`} className="hover:underline">{m.modelo}</Link></span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
      {oferta && (
        <OfertaAoEntrar
          slug={loja.slug}
          carro={{ id: oferta.id, nome: nomeDoVeiculo(oferta), precoCents: oferta.precoCents, fotoId: oferta.fotos[0]?.id ?? null }}
          whatsapp={loja.whatsapp ? `https://wa.me/${loja.whatsapp}?text=${encodeURIComponent(`Olá! Vi a oferta do ${nomeDoVeiculo(oferta)} no site: ${baseDosCarros}/${oferta.id}`)}` : null}
        />
      )}
    </CascaDaLoja>
  );
}
