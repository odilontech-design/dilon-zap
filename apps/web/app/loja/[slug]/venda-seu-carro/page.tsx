import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { linkWhatsapp, lojaPublica } from "@/lib/vitrine";
import { baseDaLoja } from "@/lib/vitrine";
import { caminhoDaLoja } from "@/lib/vitrine-aparencia";
import { BotaoWhatsapp } from "../rastreio";
import { CabecalhoDaPagina, CascaDaLoja } from "../casca";
import { FormularioAvaliacao } from "../formularios";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const loja = await lojaPublica(params.slug);
  if (!loja) return { title: "Loja não encontrada" };
  const titulo = `Venda seu carro · ${loja.nome}`;
  const descricao = `Venda ou troque seu carro na ${loja.nome}: avaliação rápida e proposta pelo WhatsApp.`;
  return { title: titulo, description: descricao, alternates: { canonical: `${baseDaLoja(loja.dominio)}${caminhoDaLoja(loja.slug, loja.dominio, "venda-seu-carro")}` } };
}

export default async function VendaSeuCarroPage({ params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) notFound();
  return (
    <CascaDaLoja loja={loja} aba="venda-seu-carro">
      <CabecalhoDaPagina titulo="Venda seu carro" texto={`Quer vender ou trocar o seu carro? Conte um pouco sobre ele e a ${loja.nome} faz uma avaliação e chama você no WhatsApp com a proposta.`} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {loja.formularioAtivo ? (
          <FormularioAvaliacao slug={loja.slug} />
        ) : (
          loja.whatsapp && (
            <BotaoWhatsapp
              href={linkWhatsapp(loja.whatsapp, "Olá! Quero vender o meu carro. Pode fazer uma avaliação?")}
              className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-medium text-white hover:opacity-90"
            >
              Pedir avaliação pelo WhatsApp
            </BotaoWhatsapp>
          )
        )}
      </main>
    </CascaDaLoja>
  );
}
