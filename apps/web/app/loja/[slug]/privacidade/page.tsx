import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseDaLoja, lojaPublica } from "@/lib/vitrine";
import { caminhoDaLoja, politicaPadrao } from "@/lib/vitrine-aparencia";
import { CabecalhoDaPagina, CascaDaLoja } from "../casca";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const loja = await lojaPublica(params.slug);
  if (!loja) return { title: "Loja não encontrada" };
  return {
    title: `Política de privacidade · ${loja.nome}`,
    robots: { index: true, follow: true },
    alternates: { canonical: `${baseDaLoja(loja.dominio)}${caminhoDaLoja(loja.slug, loja.dominio, "privacidade")}` },
  };
}

export default async function PrivacidadePage({ params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) notFound();
  const secoes = loja.politica ? null : politicaPadrao({ nome: loja.nome, endereco: loja.endereco, whatsapp: loja.whatsapp, usaPixel: !!loja.metaPixelId, usaAnalytics: !!loja.ga4Id });
  return (
    <CascaDaLoja loja={loja} aba="privacidade">
      <CabecalhoDaPagina titulo="Política de privacidade" />
      <main className="mx-auto max-w-3xl px-4 py-6 text-sm leading-relaxed text-neutral-700">
        {loja.politica ? (
          <p className="whitespace-pre-line">{loja.politica}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {secoes!.map((s) => (
              <section key={s.titulo}>
                <h2 className="mb-1 text-base font-semibold text-neutral-900">{s.titulo}</h2>
                <p>{s.texto}</p>
              </section>
            ))}
          </div>
        )}
      </main>
    </CascaDaLoja>
  );
}
