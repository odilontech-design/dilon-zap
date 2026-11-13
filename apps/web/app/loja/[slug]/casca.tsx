import Link from "next/link";
import { linkWhatsapp, type LojaPublica } from "@/lib/vitrine";
import { caminhoDaLoja, corDoTexto, type PaginaDaLoja } from "@/lib/vitrine-aparencia";
import { cidadeDaLoja } from "@/lib/vitrine-seo";
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
  const escuro = !loja.cabecalhoClaro;
  const cidade = cidadeDaLoja(loja.endereco);
  const financiar = caminho("financiamento");
  const sub = escuro ? "text-neutral-400" : "text-neutral-600";
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-neutral-900" style={estiloDaLoja(loja)}>
      <header className={`sticky top-0 z-20 backdrop-blur ${escuro ? "bg-neutral-950/95 text-white" : "border-b border-neutral-200 bg-surface/95"}`}>
        <div className="h-0.5 w-full" style={{ background: "var(--loja)" }} />
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href={caminho()} className="flex min-w-0 items-center gap-3">
            {loja.temLogo ? (
              // Logo da loja: endereço próprio (redireciona para o arquivo), tamanho livre.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={marca("logo")} alt={loja.nome} className="h-11 max-w-[200px] object-contain md:h-12" />
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
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 transition ${aba === m.aba ? "font-medium" : escuro ? "text-neutral-300 hover:bg-white/10 hover:text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
              style={aba === m.aba ? { background: "var(--loja)", color: "var(--loja-texto)" } : undefined}
            >
              {m.rotulo}
            </Link>
          ))}
        </nav>
      </header>

      {hero && (
        <div className="relative isolate overflow-hidden bg-neutral-950 text-white">
          {loja.temBanner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca("banner")} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60" />
          ) : (
            <>
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-800" />
              <div className="absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full opacity-30 blur-3xl" style={{ background: "var(--loja)" }} />
            </>
          )}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-12 md:py-20">
            <p className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "var(--loja)" }}>
              Seminovos e usados{cidade ? ` · ${cidade}` : ""}
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">{loja.nome}</h1>
            {loja.sobre ? (
              <p className="max-w-2xl whitespace-pre-line text-sm text-neutral-200 md:text-base">{loja.sobre}</p>
            ) : (
              loja.endereco && <p className="text-sm text-neutral-300">{loja.endereco}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-3">
              <a href="#estoque" className="rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition hover:opacity-90" style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>
                Ver estoque
              </a>
              <Link href={financiar} className="rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                Simular financiamento
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1">{children}</div>

      <footer className={`mt-12 ${escuro ? "bg-neutral-950 text-neutral-200" : "border-t border-neutral-200 bg-surface"}`}>
        <div className="h-0.5 w-full" style={{ background: "var(--loja)" }} />
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold">{loja.nome}</p>
            {loja.endereco && <p className={`mt-1 ${sub}`}>{loja.endereco}</p>}
          </div>
          <div>
            <p className="font-semibold">Fale com a gente</p>
            {loja.whatsapp && (
              <a href={linkWhatsapp(loja.whatsapp, `Olá! Vi o site da ${loja.nome}.`)} target="_blank" rel="noreferrer" className={`mt-1 block ${sub} hover:underline`}>
                WhatsApp {loja.whatsapp.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3")}
              </a>
            )}
          </div>
          {loja.horario.length > 0 && (
            <div>
              <p className="font-semibold">Horário</p>
              <ul className={`mt-1 ${sub}`}>
                {loja.horario.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="font-semibold">Mais</p>
            <ul className={`mt-1 flex flex-col gap-1 ${sub}`}>
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
