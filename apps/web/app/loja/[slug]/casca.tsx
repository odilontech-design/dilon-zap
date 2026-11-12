import Link from "next/link";
import { linkWhatsapp, type LojaPublica } from "@/lib/vitrine";
import { caminhoDaLoja, corDoTexto, type PaginaDaLoja } from "@/lib/vitrine-aparencia";
import { BotaoWhatsapp } from "./rastreio";

/**
 * A moldura de toda página pública da loja: cabeçalho com logo e menu, rodapé
 * com contato, horário e redes, e a cor da loja como variável de CSS
 * (--loja e --loja-texto, com o texto escolhido para contrastar com a cor).
 */

export type Aba = "vitrine" | PaginaDaLoja;

const MENU: { aba: Aba; rotulo: string; pagina?: PaginaDaLoja }[] = [
  { aba: "vitrine", rotulo: "Veículos" },
  { aba: "venda-seu-carro", rotulo: "Venda seu carro", pagina: "venda-seu-carro" },
  { aba: "financiamento", rotulo: "Financiamento", pagina: "financiamento" },
  { aba: "localizacao", rotulo: "Localização", pagina: "localizacao" },
];

export function estiloDaLoja(loja: LojaPublica): React.CSSProperties {
  return { "--loja": loja.cor, "--loja-texto": corDoTexto(loja.cor) } as React.CSSProperties;
}

export function CascaDaLoja({ loja, aba, hero = false, children }: { loja: LojaPublica; aba: Aba; hero?: boolean; children: React.ReactNode }) {
  const caminho = (p?: PaginaDaLoja) => caminhoDaLoja(loja.slug, loja.dominio, p);
  const marca = (tipo: "logo" | "banner") => `/api/loja/${loja.slug}/marca/${tipo}`;
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-neutral-900" style={estiloDaLoja(loja)}>
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href={caminho()} className="flex min-w-0 items-center gap-3">
            {loja.temLogo ? (
              // Logo da loja: endereço próprio (redireciona para o arquivo), tamanho livre.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={marca("logo")} alt={loja.nome} className="h-10 max-w-[180px] object-contain" />
            ) : (
              <span className="truncate text-lg font-semibold">{loja.nome}</span>
            )}
          </Link>
          {loja.whatsapp && (
            <BotaoWhatsapp
              href={linkWhatsapp(loja.whatsapp, `Olá! Vi o site da ${loja.nome} e quero mais informações.`)}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <span className="hidden sm:inline">Falar no WhatsApp</span>
              <span className="sm:hidden">WhatsApp</span>
            </BotaoWhatsapp>
          )}
        </div>
        <nav aria-label="Menu da loja" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 text-sm">
          {MENU.map((m) => (
            <Link
              key={m.aba}
              href={caminho(m.pagina)}
              aria-current={aba === m.aba ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 ${aba === m.aba ? "font-medium" : "text-neutral-600 hover:bg-neutral-100"}`}
              style={aba === m.aba ? { background: "var(--loja)", color: "var(--loja-texto)" } : undefined}
            >
              {m.rotulo}
            </Link>
          ))}
        </nav>
      </header>

      {hero &&
        (loja.temBanner ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={marca("banner")} alt="" className="h-44 w-full object-cover md:h-72" />
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent">
              <div className="mx-auto w-full max-w-6xl px-4 pb-5 text-white">
                <h1 className="text-2xl font-semibold drop-shadow md:text-3xl">{loja.nome}</h1>
                {loja.endereco && <p className="text-sm opacity-90">{loja.endereco}</p>}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>
            <div className="mx-auto max-w-6xl px-4 py-8">
              <h1 className="text-2xl font-semibold md:text-3xl">{loja.nome}</h1>
              {loja.endereco && <p className="mt-1 text-sm opacity-90">{loja.endereco}</p>}
              {loja.sobre && <p className="mt-3 max-w-3xl whitespace-pre-line text-sm opacity-95">{loja.sobre}</p>}
            </div>
          </div>
        ))}
      {hero && loja.temBanner && loja.sobre && <p className="mx-auto w-full max-w-6xl whitespace-pre-line px-4 pt-5 text-sm text-neutral-600">{loja.sobre}</p>}

      <div className="flex-1">{children}</div>

      <footer className="mt-8 border-t border-neutral-200 bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold">{loja.nome}</p>
            {loja.endereco && <p className="mt-1 text-neutral-600">{loja.endereco}</p>}
          </div>
          <div>
            <p className="font-semibold">Fale com a gente</p>
            {loja.whatsapp && (
              <a href={linkWhatsapp(loja.whatsapp, `Olá! Vi o site da ${loja.nome}.`)} target="_blank" rel="noreferrer" className="mt-1 block text-neutral-600 hover:underline">
                WhatsApp {loja.whatsapp.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3")}
              </a>
            )}
          </div>
          {loja.horario.length > 0 && (
            <div>
              <p className="font-semibold">Horário</p>
              <ul className="mt-1 text-neutral-600">
                {loja.horario.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="font-semibold">Mais</p>
            <ul className="mt-1 flex flex-col gap-1 text-neutral-600">
              {loja.instagram && (
                <li>
                  <a href={loja.instagram} target="_blank" rel="noreferrer me" className="hover:underline">
                    Instagram
                  </a>
                </li>
              )}
              {loja.facebook && (
                <li>
                  <a href={loja.facebook} target="_blank" rel="noreferrer me" className="hover:underline">
                    Facebook
                  </a>
                </li>
              )}
              <li>
                <Link href={caminho("privacidade")} className="hover:underline">
                  Política de privacidade
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-neutral-400">Preços e disponibilidade sujeitos a alteração sem aviso. Confirme pelo WhatsApp.</p>
      </footer>
    </div>
  );
}

/** Título e texto de abertura de uma página interna. */
export function CabecalhoDaPagina({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      {texto && <p className="mt-2 max-w-2xl text-sm text-neutral-600">{texto}</p>}
    </div>
  );
}
