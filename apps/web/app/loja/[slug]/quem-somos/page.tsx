import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { baseDaLoja, linkWhatsapp, lojaPublica } from "@/lib/vitrine";
import { caminhoDaLoja } from "@/lib/vitrine-aparencia";
import { cidadeDaLoja } from "@/lib/vitrine-seo";
import { BotaoWhatsapp } from "../rastreio";
import { CabecalhoDaPagina, CascaDaLoja } from "../casca";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const loja = await lojaPublica(params.slug);
  if (!loja) return { title: "Loja não encontrada" };
  const cidade = cidadeDaLoja(loja.endereco);
  return {
    title: { absolute: `Quem somos · ${loja.nome}${cidade ? ` em ${cidade}` : ""}` },
    description: (loja.quemSomosTitulo ?? loja.quemSomosTexto ?? loja.sobre ?? `Conheça a ${loja.nome}.`).slice(0, 160),
    alternates: { canonical: `${baseDaLoja(loja.dominio)}${caminhoDaLoja(loja.slug, loja.dominio, "quem-somos")}` },
  };
}

/** "Quem somos": o texto que a loja escreve em Meu site > Páginas (ou, sem ele, o "sobre" da loja). */
export default async function QuemSomosPage({ params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) notFound();
  const texto = loja.quemSomosTexto ?? loja.sobre;
  return (
    <CascaDaLoja loja={loja} aba="quem-somos">
      <CabecalhoDaPagina titulo="Quem somos" texto={loja.quemSomosTitulo ?? undefined} />
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[1.6fr_1fr]">
        <article className="whitespace-pre-line text-base leading-relaxed text-neutral-700">{texto ?? `A ${loja.nome} trabalha com carros seminovos e usados, com procedência e atendimento próximo. Fale com a gente pelo WhatsApp.`}</article>
        <aside className="flex flex-col gap-3 self-start rounded-2xl border border-neutral-200 bg-surface p-5 text-sm">
          <p className="font-semibold">Venha nos visitar</p>
          {loja.endereco && <p className="text-neutral-600">{loja.endereco}</p>}
          {loja.horario.length > 0 && <ul className="text-neutral-600">{loja.horario.map((h) => <li key={h}>{h}</li>)}</ul>}
          <Link href={caminhoDaLoja(loja.slug, loja.dominio)} className="rounded-xl px-4 py-3 text-center font-bold" style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>Ver nossos carros</Link>
          {loja.whatsapp && <BotaoWhatsapp href={linkWhatsapp(loja.whatsapp, `Olá! Vi o site da ${loja.nome}.`)} className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 font-bold text-white">Falar no WhatsApp</BotaoWhatsapp>}
        </aside>
      </main>
    </CascaDaLoja>
  );
}
