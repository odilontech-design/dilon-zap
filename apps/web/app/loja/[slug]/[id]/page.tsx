import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  baseDaLoja,
  carroDaVitrine,
  carrosDaVitrine,
  linkDoCarro,
  linkWhatsapp,
  lojaPublica,
  mensagemDeInteresse,
} from "@/lib/vitrine";
import { brl, fotoUrl, resumo, titulo } from "../comum";
import { BotaoWhatsapp } from "../rastreio";
import { carroParaJsonLd, JsonLd } from "../dados-estruturados";
import { CascaDaLoja } from "../casca";
import { caminhoDaLoja } from "@/lib/vitrine-aparencia";
import { breadcrumbJsonLd, descricaoDoCarro, slugDe, tituloDoCarro } from "@/lib/vitrine-seo";
import { FormularioInteresse } from "./formulario-interesse";
import { Galeria } from "./galeria";
import { Compartilhar } from "./compartilhar";
import { CartaoDeCarro } from "../cartao-de-carro";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string; id: string };
}): Promise<Metadata> {
  const loja = await lojaPublica(params.slug);
  const carro = loja ? await carroDaVitrine(loja, params.id) : null;
  if (!loja || !carro) return { title: "Veículo não encontrado" };
  const nome = tituloDoCarro(carro, loja);
  const descricao = descricaoDoCarro(carro, loja);
  // A capa no cartão do link (WhatsApp, Instagram, Facebook): é o que faz o link ser clicado.
  const capa = carro.fotos[0]
    ? `${baseDaLoja(loja.dominio)}${fotoUrl(loja.slug, carro.fotos[0].id, 1200)}`
    : undefined;
  return {
    title: { absolute: nome },
    description: descricao,
    robots: { index: true, follow: true, "max-image-preview": "large" },
    twitter: { card: "summary_large_image", title: nome, description: descricao, ...(capa ? { images: [capa] } : {}) },
    openGraph: {
      siteName: loja.nome,
      locale: "pt_BR",
      title: nome,
      description: descricao,
      url: linkDoCarro(loja.slug, carro.id, loja.dominio),
      type: "website",
      ...(capa ? { images: [capa] } : {}),
    },
    alternates: { canonical: linkDoCarro(loja.slug, carro.id, loja.dominio) },
  };
}

export default async function CarroPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const loja = await lojaPublica(params.slug);
  if (!loja) notFound();
  const carro = await carroDaVitrine(loja, params.id);
  if (!carro) notFound();

  const link = linkDoCarro(loja.slug, carro.id, loja.dominio);
  const whatsapp = loja.whatsapp
    ? linkWhatsapp(loja.whatsapp, mensagemDeInteresse(carro, link))
    : null;
  const fotosAbsolutas = carro.fotos.map(
    (f) => `${baseDaLoja(loja.dominio)}${fotoUrl(loja.slug, f.id)}`,
  );
  const ficha: [string, string | number | null][] = [
    ["Marca", carro.marca],
    ["Modelo", carro.modelo],
    ["Versão", carro.versao],
    ["Ano", `${carro.anoFabricacao}/${carro.anoModelo}`],
    ["Quilometragem", carro.kmInformado ? `${carro.km.toLocaleString("pt-BR")} km` : null],
    ["Câmbio", carro.cambio],
    ["Combustível", carro.combustivel],
    ["Cor", carro.cor],
    ["Portas", carro.portas],
  ];

  // Carros parecidos: mesmo modelo, mesma marca ou preço próximo. Mantém o visitante no site e liga as páginas entre si.
  const todos = await carrosDaVitrine(loja);
  const parecidos = todos
    .filter((c) => c.id !== carro.id)
    .map((c) => ({ c, nota: (c.modelo === carro.modelo ? 3 : 0) + (c.marca === carro.marca ? 2 : 0) + (Math.abs(c.precoCents - carro.precoCents) <= carro.precoCents * 0.25 ? 1 : 0) }))
    .filter((x) => x.nota > 0)
    .sort((a, b) => b.nota - a.nota || Math.abs(a.c.precoCents - carro.precoCents) - Math.abs(b.c.precoCents - carro.precoCents))
    .slice(0, 3)
    .map((x) => x.c);

  const financiar = caminhoDaLoja(loja.slug, loja.dominio, "financiamento");
  const visita = caminhoDaLoja(loja.slug, loja.dominio, "localizacao");
  const marcaSlug = slugDe(carro.marca);
  const nomeCompleto = `${carro.marca} ${carro.modelo} ${carro.versao ?? ""}`.replace(/\s+/g, " ").trim();
  const base = `${baseDaLoja(loja.dominio)}/loja/${loja.slug}`;
  return (
    <CascaDaLoja loja={loja} aba="vitrine" subirBotao>
      <div className="pb-24 md:pb-0">
        <nav aria-label="Você está em" className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-4 pt-5 text-sm text-neutral-500">
          <Link href={caminhoDaLoja(loja.slug, loja.dominio)} className="hover:text-neutral-900">Estoque</Link>
          <span aria-hidden>›</span>
          <Link href={`/loja/${loja.slug}/marca/${marcaSlug}`} className="hover:text-neutral-900">{carro.marca}</Link>
          <span aria-hidden>›</span>
          <Link href={`/loja/${loja.slug}/marca/${marcaSlug}/${slugDe(carro.modelo)}`} className="hover:text-neutral-900">{carro.modelo}</Link>
        </nav>

        <main className="mx-auto grid max-w-6xl gap-8 px-4 py-5 md:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-8">
            <Galeria slug={loja.slug} fotos={carro.fotos.map((f) => f.id)} alt={titulo(carro)} />

            {(carro.descricao || carro.opcionais.length > 0) && (
              <section className="flex flex-col gap-5 rounded-2xl border border-neutral-200 bg-surface p-5 md:p-6">
                {carro.descricao && (
                  <div>
                    <h2 className="mb-2 text-base font-bold">Sobre este veículo</h2>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{carro.descricao}</p>
                  </div>
                )}
                {carro.opcionais.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-base font-bold">Opcionais</h2>
                    <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      {carro.opcionais.map((o) => (
                        <li key={o} className="flex items-start gap-2">
                          <span className="mt-0.5 font-bold" style={{ color: "var(--loja)" }} aria-hidden>✓</span>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-neutral-200 bg-surface p-5 md:p-6">
              <h2 className="mb-3 text-base font-bold">Ficha técnica</h2>
              <dl className="grid gap-x-8 sm:grid-cols-2">
                {ficha
                  .filter(([, v]) => v !== null && v !== "")
                  .map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-4 border-b border-neutral-100 py-2.5 text-sm">
                      <dt className="text-neutral-500">{k}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          </div>

          <aside className="flex flex-col gap-4 md:sticky md:top-24 md:self-start">
            <div className="rounded-2xl border border-neutral-200 bg-surface p-5 shadow-sm">
              {carro.status === "RESERVADO" && (
                <span className="mb-3 inline-block rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold text-white">Reservado</span>
              )}
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">{carro.marca}</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight">
                {carro.modelo} {carro.versao ?? ""}
              </h1>
              <p className="mt-1 text-sm text-neutral-500">
                {carro.anoFabricacao}/{carro.anoModelo} · {resumo(carro)}
              </p>
              <p className="mt-4 text-4xl font-extrabold tracking-tight">{brl(carro.precoCents)}</p>
              <p className="mt-1 text-xs text-neutral-500">Preço sujeito a alteração. Confirme pelo WhatsApp.</p>

              {whatsapp && (
                <BotaoWhatsapp
                  href={whatsapp}
                  valorCents={carro.precoCents}
                  className="mt-5 hidden items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 text-base font-bold text-white shadow hover:opacity-90 md:flex"
                >
                  Tenho interesse
                </BotaoWhatsapp>
              )}
              <Link
                href={`${financiar}${financiar.includes("?") ? "&" : "?"}carro=${carro.id}`}
                className="mt-3 block rounded-xl px-4 py-3 text-center text-sm font-bold shadow-sm transition hover:opacity-90"
                style={{ background: "var(--loja)", color: "var(--loja-texto)" }}
              >
                Simular financiamento
              </Link>
              <Link href={visita} className="mt-3 block rounded-xl border border-neutral-300 px-4 py-3 text-center text-sm font-semibold hover:bg-neutral-50">
                Ver endereço e agendar visita
              </Link>
              <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4">
                <Compartilhar url={link} titulo={nomeCompleto} />
                <Link href={caminhoDaLoja(loja.slug, loja.dominio)} className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
                  ← Todo o estoque
                </Link>
              </div>
            </div>
            {loja.formularioAtivo && (
              <FormularioInteresse
                slug={loja.slug}
                veiculoId={carro.id}
                valorCents={carro.precoCents}
              />
            )}
          </aside>
        </main>

        {parecidos.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-6 pt-4" aria-label="Carros parecidos">
            <h2 className="mb-4 text-xl font-bold tracking-tight">Você também pode gostar</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {parecidos.map((c) => (
                <CartaoDeCarro key={c.id} slug={loja.slug} c={c} whatsapp={loja.whatsapp} baseUrl={base} />
              ))}
            </div>
          </section>
        )}

        <JsonLd
          dados={{
            "@context": "https://schema.org",
            ...carroParaJsonLd(carro, link, fotosAbsolutas, loja.nome),
          }}
        />
        <JsonLd dados={breadcrumbJsonLd(loja, carro, link)} />
        {whatsapp && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-surface/95 p-3 backdrop-blur md:hidden">
            <BotaoWhatsapp
              href={whatsapp}
              valorCents={carro.precoCents}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 font-bold text-white"
            >
              Tenho interesse · {brl(carro.precoCents)}
            </BotaoWhatsapp>
          </div>
        )}
      </div>
    </CascaDaLoja>
  );
}
