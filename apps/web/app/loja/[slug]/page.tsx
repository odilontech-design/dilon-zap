import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseDaLoja, carrosDaVitrine, linkDaLoja, linkDoCarro, lojaPublica } from "@/lib/vitrine";
import { CascaDaLoja } from "./casca";
import { carroParaJsonLd, JsonLd } from "./dados-estruturados";
import { ListaDeCarros } from "./lista-de-carros";

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
  const carros = await carrosDaVitrine(loja);

  const urlDaLoja = linkDaLoja(loja.slug, loja.dominio);
  return (
    <CascaDaLoja loja={loja} aba="vitrine" hero>
      <JsonLd
        dados={{
          "@context": "https://schema.org",
          "@type": "AutoDealer",
          name: loja.nome,
          url: urlDaLoja,
          ...(loja.endereco ? { address: loja.endereco } : {}),
          ...(loja.whatsapp ? { telephone: `+${loja.whatsapp}` } : {}),
          ...(loja.temLogo ? { image: `${baseDaLoja(loja.dominio)}/api/loja/${loja.slug}/marca/logo` } : {}),
          ...(loja.horario.length ? { openingHours: loja.horario } : {}),
          ...(loja.instagram || loja.facebook ? { sameAs: [loja.instagram, loja.facebook].filter(Boolean) } : {}),
          makesOffer: carros.slice(0, 50).map((c) => ({ "@type": "Offer", price: (c.precoCents / 100).toFixed(2), priceCurrency: "BRL", itemOffered: carroParaJsonLd(c, linkDoCarro(loja.slug, c.id, loja.dominio), []) })),
        }}
      />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <ListaDeCarros slug={loja.slug} carros={carros} />
      </main>
    </CascaDaLoja>
  );
}
