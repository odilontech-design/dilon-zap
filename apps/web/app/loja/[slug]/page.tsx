import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { carrosDaVitrine, linkDaLoja, linkWhatsapp, lojaPublica } from "@/lib/vitrine";
import { IconeWhatsapp } from "./comum";
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
    title: `${loja.nome} · Veículos à venda`,
    description: descricao,
    openGraph: { title: `${loja.nome} · Veículos à venda`, description: descricao, url: linkDaLoja(loja.slug), type: "website" },
  };
}

export default async function LojaPage({ params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) notFound();
  const carros = await carrosDaVitrine(loja);

  return (
    <div className="min-h-screen bg-canvas text-neutral-900">
      <header className="border-b border-neutral-200 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <div>
            <h1 className="text-xl font-semibold">{loja.nome}</h1>
            {loja.endereco && <p className="text-sm text-neutral-500">{loja.endereco}</p>}
          </div>
          {loja.whatsapp && (
            <a
              href={linkWhatsapp(loja.whatsapp, `Olá! Vi o estoque no site da ${loja.nome} e quero mais informações.`)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <IconeWhatsapp /> Falar no WhatsApp
            </a>
          )}
        </div>
        {loja.sobre && <p className="mx-auto max-w-6xl whitespace-pre-line px-4 pb-5 text-sm text-neutral-600">{loja.sobre}</p>}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <ListaDeCarros slug={loja.slug} carros={carros} />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-neutral-400">Preços e disponibilidade sujeitos a alteração sem aviso. Confirme pelo WhatsApp.</footer>
    </div>
  );
}
