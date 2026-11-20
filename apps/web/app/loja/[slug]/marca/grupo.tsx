import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { baseDaLoja, carrosDaVitrine, linkDaLoja, linkDoCarro, lojaPublica } from "@/lib/vitrine";
import { caminhoDaLoja } from "@/lib/vitrine-aparencia";
import { carrosDoGrupo, gruposDoEstoque, linkDaMarca, linkDoModelo, listaJsonLd, textosDoGrupo } from "@/lib/vitrine-seo";
import { CabecalhoDaPagina, CascaDaLoja } from "../casca";
import { JsonLd } from "../dados-estruturados";
import { Suspense } from "react";
import { FaixaDeMarcas } from "../marcas";
import { ListaDeCarros } from "../lista-de-carros";

/** Dados da página de marca ou modelo: só existe se há carro desse grupo em estoque (senão, 404). */
async function carregar(slug: string, marcaSlug: string, modeloSlug?: string) {
  const loja = await lojaPublica(slug);
  if (!loja) return null;
  const todos = await carrosDaVitrine(loja);
  const carros = carrosDoGrupo(todos, marcaSlug, modeloSlug);
  if (!carros.length) return null;
  const grupo = gruposDoEstoque(todos).find((g) => g.marcaSlug === marcaSlug)!;
  const modelo = modeloSlug ? grupo.modelos.find((m) => m.modeloSlug === modeloSlug) ?? null : null;
  const nome = modelo ? `${grupo.marca} ${modelo.modelo}` : grupo.marca;
  return { loja, carros, grupo, modelo, nome, grupos: gruposDoEstoque(todos), textos: textosDoGrupo(loja, nome, carros) };
}

export async function metadataDoGrupo(slug: string, marcaSlug: string, modeloSlug?: string): Promise<Metadata> {
  const d = await carregar(slug, marcaSlug, modeloSlug);
  if (!d) return { title: "Página não encontrada", robots: { index: false } };
  const url = modeloSlug ? linkDoModelo(d.loja, marcaSlug, modeloSlug) : linkDaMarca(d.loja, marcaSlug);
  return {
    title: { absolute: d.textos.titulo },
    description: d.textos.descricao,
    robots: { index: true, follow: true, "max-image-preview": "large" },
    alternates: { canonical: url },
    openGraph: { title: d.textos.titulo, description: d.textos.descricao, url, siteName: d.loja.nome, locale: "pt_BR", type: "website" },
  };
}

export async function PaginaDoGrupo({ slug, marcaSlug, modeloSlug }: { slug: string; marcaSlug: string; modeloSlug?: string }) {
  const d = await carregar(slug, marcaSlug, modeloSlug);
  if (!d) notFound();
  const { loja, carros, grupo, grupos, nome, textos } = d;
  const urlAtual = modeloSlug ? linkDoModelo(loja, marcaSlug, modeloSlug) : linkDaMarca(loja, marcaSlug);
  const trilha = [
    { name: loja.nome, item: linkDaLoja(loja.slug, loja.dominio) },
    { name: grupo.marca, item: linkDaMarca(loja, marcaSlug) },
    ...(modeloSlug ? [{ name: nome, item: urlAtual }] : []),
  ];
  return (
    <CascaDaLoja loja={loja} aba="vitrine">
      <JsonLd dados={listaJsonLd(textos.h1, carros, (c) => linkDoCarro(loja.slug, c.id, loja.dominio))} />
      <JsonLd dados={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: trilha.map((t, i) => ({ "@type": "ListItem", position: i + 1, ...t })) }} />
      <div className="mx-auto max-w-6xl px-4 pt-4 text-sm text-neutral-500">
        <Link href={caminhoDaLoja(loja.slug, loja.dominio)} className="hover:text-neutral-900">Todos os veículos</Link>
        {" / "}
        {modeloSlug ? <Link href={`/loja/${loja.slug}/marca/${marcaSlug}`} className="hover:text-neutral-900">{grupo.marca}</Link> : <span>{grupo.marca}</span>}
        {modeloSlug && <> {" / "}<span>{nome}</span></>}
      </div>
      <CabecalhoDaPagina titulo={textos.h1} texto={textos.abertura} />
      {!modeloSlug && grupo.modelos.length > 1 && (
        <nav aria-label={`Modelos ${grupo.marca}`} className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 pt-4">
          {grupo.modelos.map((m) => (
            <Link key={m.modeloSlug} href={`/loja/${loja.slug}/marca/${marcaSlug}/${m.modeloSlug}`} className="rounded-full bg-neutral-100 px-3 py-1 text-sm hover:bg-neutral-200">
              {m.modelo} · {m.n}
            </Link>
          ))}
        </nav>
      )}
      <FaixaDeMarcas slug={loja.slug} grupos={grupos} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Suspense>
          <ListaDeCarros slug={loja.slug} carros={carros} whatsapp={loja.whatsapp} baseUrl={`${baseDaLoja(loja.dominio)}/loja/${loja.slug}`} titulo={`${nome} à venda`} />
        </Suspense>
      </main>
    </CascaDaLoja>
  );
}
