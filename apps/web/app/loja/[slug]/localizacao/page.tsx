import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseDaLoja, linkWhatsapp, lojaPublica } from "@/lib/vitrine";
import { caminhoDaLoja, mapaDoEndereco } from "@/lib/vitrine-aparencia";
import { BotaoWhatsapp } from "../rastreio";
import { CabecalhoDaPagina, CascaDaLoja } from "../casca";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const loja = await lojaPublica(params.slug);
  if (!loja) return { title: "Loja não encontrada" };
  return {
    title: `Localização e contato · ${loja.nome}`,
    description: `${loja.nome}${loja.endereco ? `: ${loja.endereco}` : ""}. Horário de funcionamento e como chegar.`,
    alternates: { canonical: `${baseDaLoja(loja.dominio)}${caminhoDaLoja(loja.slug, loja.dominio, "localizacao")}` },
  };
}

export default async function LocalizacaoPage({ params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) notFound();
  const mapa = mapaDoEndereco(loja.endereco);
  return (
    <CascaDaLoja loja={loja} aba="localizacao">
      <CabecalhoDaPagina titulo="Localização e contato" texto="Venha conhecer os carros pessoalmente." />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[1fr_1.4fr]">
        <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-surface p-5 text-sm">
          {loja.endereco ? (
            <div>
              <h2 className="font-semibold">Endereço</h2>
              <p className="mt-1 text-neutral-700">{loja.endereco}</p>
              {mapa && (
                <a href={mapa.abrir} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium hover:underline" style={{ color: "var(--loja)" }}>
                  Como chegar (Google Maps)
                </a>
              )}
            </div>
          ) : (
            <p className="text-neutral-600">O endereço da loja ainda não foi informado.</p>
          )}
          {loja.horario.length > 0 && (
            <div>
              <h2 className="font-semibold">Horário de funcionamento</h2>
              <ul className="mt-1 text-neutral-700">
                {loja.horario.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          {loja.whatsapp && (
            <div>
              <h2 className="font-semibold">WhatsApp</h2>
              <BotaoWhatsapp
                href={linkWhatsapp(loja.whatsapp, `Olá! Vi o site da ${loja.nome} e quero falar com vocês.`)}
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Chamar agora
              </BotaoWhatsapp>
            </div>
          )}
        </section>
        {mapa && (
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <iframe title={`Mapa: ${loja.endereco}`} src={mapa.embed} className="h-80 w-full md:h-full md:min-h-[360px]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        )}
      </main>
    </CascaDaLoja>
  );
}
