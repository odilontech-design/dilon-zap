import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  baseDaLoja,
  carroDaVitrine,
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
import { breadcrumbJsonLd, descricaoDoCarro, tituloDoCarro } from "@/lib/vitrine-seo";
import { FormularioInteresse } from "./formulario-interesse";
import { Galeria } from "./galeria";

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
    ["Ano", `${carro.anoFabricacao}/${carro.anoModelo}`],
    ["Quilometragem", carro.kmInformado ? `${carro.km.toLocaleString("pt-BR")} km` : null],
    ["Câmbio", carro.cambio],
    ["Combustível", carro.combustivel],
    ["Cor", carro.cor],
    ["Portas", carro.portas],
  ];

  const financiar = caminhoDaLoja(loja.slug, loja.dominio, "financiamento");
  return (
    <CascaDaLoja loja={loja} aba="vitrine">
      <div className="pb-24 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <Link
            href={caminhoDaLoja(loja.slug, loja.dominio)}
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            ← Todos os veículos
          </Link>
        </div>
        <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[1fr_360px]">
          <Galeria
            slug={loja.slug}
            fotos={carro.fotos.map((f) => f.id)}
            alt={titulo(carro)}
          />
          <aside className="flex flex-col gap-4">
            <div className="rounded-xl border border-neutral-200 bg-surface p-5">
              {carro.status === "RESERVADO" && (
                <span className="mb-2 inline-block rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-medium text-white">
                  Reservado
                </span>
              )}
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                {carro.marca}
              </p>
              <h1 className="text-xl font-semibold leading-tight">
                {carro.modelo} {carro.versao ?? ""}
              </h1>
              <p className="mt-1 text-sm text-neutral-500">
                {carro.anoFabricacao}/{carro.anoModelo} · {resumo(carro)}
              </p>
              <p className="mt-4 text-3xl font-bold">{brl(carro.precoCents)}</p>
              <Link
                href={`${financiar}${financiar.includes("?") ? "&" : "?"}carro=${carro.id}`}
                className="mt-4 block rounded-lg border border-neutral-300 px-4 py-2.5 text-center text-sm font-medium hover:bg-neutral-50"
              >
                Simular financiamento
              </Link>
              {whatsapp && (
                <BotaoWhatsapp
                  href={whatsapp}
                  valorCents={carro.precoCents}
                  className="mt-3 hidden items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 font-medium text-white hover:opacity-90 md:flex"
                >
                  Tenho interesse
                </BotaoWhatsapp>
              )}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold">Ficha</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {ficha
                  .filter(([, v]) => v !== null && v !== "")
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-neutral-500">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
            </div>
            {loja.formularioAtivo && (
              <FormularioInteresse
                slug={loja.slug}
                veiculoId={carro.id}
                valorCents={carro.precoCents}
              />
            )}
          </aside>
          {(carro.opcionais.length > 0 || carro.descricao) && (
            <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-surface p-5 md:col-span-1">
              {carro.opcionais.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold">Opcionais</h2>
                  <ul className="flex flex-wrap gap-2">
                    {carro.opcionais.map((o) => (
                      <li
                        key={o}
                        className="rounded-full bg-neutral-100 px-3 py-1 text-xs"
                      >
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {carro.descricao && (
                <p className="whitespace-pre-line text-sm text-neutral-700">
                  {carro.descricao}
                </p>
              )}
            </section>
          )}
        </main>
        <JsonLd
          dados={{
            "@context": "https://schema.org",
            ...carroParaJsonLd(carro, link, fotosAbsolutas, loja.nome),
          }}
        />
        <JsonLd dados={breadcrumbJsonLd(loja, carro, link)} />
        {whatsapp && (
          <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-surface p-3 md:hidden">
            <BotaoWhatsapp
              href={whatsapp}
              valorCents={carro.precoCents}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 font-medium text-white"
            >
              Tenho interesse · {brl(carro.precoCents)}
            </BotaoWhatsapp>
          </div>
        )}
      </div>
    </CascaDaLoja>
  );
}
