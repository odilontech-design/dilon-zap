import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseDaLoja, carrosDaVitrine, linkWhatsapp, lojaPublica } from "@/lib/vitrine";
import { caminhoDaLoja } from "@/lib/vitrine-aparencia";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import { BotaoWhatsapp } from "../rastreio";
import { CabecalhoDaPagina, CascaDaLoja } from "../casca";
import { FormularioFinanciamento } from "../formularios";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const loja = await lojaPublica(params.slug);
  if (!loja) return { title: "Loja não encontrada" };
  return {
    title: `Financiamento · ${loja.nome}`,
    description: `Simule o financiamento do seu carro na ${loja.nome}. Nossa equipe chama você no WhatsApp com as condições.`,
    alternates: { canonical: `${baseDaLoja(loja.dominio)}${caminhoDaLoja(loja.slug, loja.dominio, "financiamento")}` },
  };
}

/** ?carro=<id> pré-seleciona o carro (o botão "Financiar" da página do carro usa isso). */
export default async function FinanciamentoPage({ params, searchParams }: { params: { slug: string }; searchParams: { carro?: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) notFound();
  const carros = await carrosDaVitrine(loja);
  const lista = carros.map((c) => ({ id: c.id, nome: `${nomeDoVeiculo(c)} · ${(c.precoCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}` }));
  const inicial = lista.some((c) => c.id === searchParams.carro) ? (searchParams.carro as string) : "";
  return (
    <CascaDaLoja loja={loja} aba="financiamento">
      <CabecalhoDaPagina titulo="Financiamento" texto="Escolha o carro, diga se tem entrada e a nossa equipe chama você no WhatsApp com as condições. Sem compromisso." />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {loja.formularioAtivo ? (
          <FormularioFinanciamento slug={loja.slug} carros={lista} carroInicial={inicial} />
        ) : (
          loja.whatsapp && (
            <BotaoWhatsapp
              href={linkWhatsapp(loja.whatsapp, "Olá! Quero simular o financiamento de um carro.")}
              className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-medium text-white hover:opacity-90"
            >
              Simular pelo WhatsApp
            </BotaoWhatsapp>
          )
        )}
      </main>
    </CascaDaLoja>
  );
}
