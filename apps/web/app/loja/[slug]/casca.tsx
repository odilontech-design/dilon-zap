import Link from "next/link";
import { linkWhatsapp, type LojaPublica } from "@/lib/vitrine";
import { caminhoDaLoja, corDoTexto, escurecer, type PaginaDaLoja } from "@/lib/vitrine-aparencia";
import { cidadeDaLoja } from "@/lib/vitrine-seo";
import { BotaoWhatsapp } from "./rastreio";
import { BotaoFlutuante } from "./botao-flutuante";
import { MenuMovel } from "./menu-movel";

/**
 * A moldura de toda página pública da loja: faixa de contato, cabeçalho com
 * logo e menu (no celular, o menu abre numa lista), rodapé com contato, horário
 * e redes, o botão flutuante do WhatsApp e a identidade da loja como variáveis
 * de CSS:
 *   --loja / --loja-texto      cor principal e o texto que contrasta com ela
 *   --loja2 / --loja2-texto    cor de destaque (a segunda cor da marca; sem ela, um tom claro da principal)
 *   --loja-escuro / --loja-mais-escuro   tons escuros da principal, para cabeçalho, abertura e rodapé
 */

export type Aba = "vitrine" | PaginaDaLoja;

const MENU: { aba: Aba; rotulo: string; pagina?: PaginaDaLoja }[] = [
  { aba: "vitrine", rotulo: "Estoque" },
  { aba: "venda-seu-carro", rotulo: "Venda seu carro", pagina: "venda-seu-carro" },
  { aba: "financiamento", rotulo: "Financiamento", pagina: "financiamento" },
  { aba: "localizacao", rotulo: "Localização", pagina: "localizacao" },
];

export function estiloDaLoja(loja: LojaPublica): React.CSSProperties {
  return {
    "--loja": loja.cor,
    "--loja-texto": corDoTexto(loja.cor),
    "--loja2": loja.corSecundaria,
    "--loja2-texto": corDoTexto(loja.corSecundaria),
    "--loja-escuro": escurecer(loja.cor, 0.2),
    "--loja-mais-escuro": escurecer(loja.cor, 0.09),
  } as React.CSSProperties;
}

const formatarWhatsapp = (n: string) => n.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

export function CascaDaLoja({ loja, aba, subirBotao = false, children }: { loja: LojaPublica; aba: Aba; /** Página com barra fixa embaixo no celular (a do carro). */ subirBotao?: boolean; children: React.ReactNode }) {
  const caminho = (p?: PaginaDaLoja) => caminhoDaLoja(loja.slug, loja.dominio, p);
  const marca = (tipo: "logo" | "banner") => `/api/loja/${loja.slug}/marca/${tipo}`;
  const escuro = !loja.cabecalhoClaro;
  const cidade = cidadeDaLoja(loja.endereco);
  const zap = loja.whatsapp ? linkWhatsapp(loja.whatsapp, `Olá! Vi o site da ${loja.nome} e quero mais informações.`) : null;
  const itens = MENU.map((m) => ({ rotulo: m.rotulo, href: caminho(m.pagina), ativo: aba === m.aba }));
  const sub = escuro ? "text-neutral-400" : "text-neutral-600";

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-neutral-900" style={estiloDaLoja(loja)}>
      {/* Faixa de contato: telefone, onde fica e quando abre, sempre à vista no computador. */}
      {(loja.whatsapp || loja.endereco || loja.horario.length > 0) && (
        <div className="hidden text-xs text-neutral-300 md:block" style={{ background: "#0a0a0a" }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1.5">
            <div className="flex items-center gap-4">
              {loja.whatsapp && <span>WhatsApp {formatarWhatsapp(loja.whatsapp)}</span>}
              {(cidade || loja.endereco) && <span className="text-neutral-400">{cidade ?? loja.endereco}</span>}
            </div>
            {loja.horario[0] && <span className="text-neutral-400">{loja.horario[0]}</span>}
          </div>
        </div>
      )}

      <header className={`sticky top-0 z-20 ${escuro ? "text-white" : "border-b border-neutral-200 bg-surface text-neutral-900"}`} style={escuro ? { background: "var(--loja-mais-escuro)" } : undefined}>
        <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, var(--loja), var(--loja2))" }} />
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href={caminho()} className="flex min-w-0 items-center gap-3" aria-label={`${loja.nome}: página inicial`}>
            {loja.temLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={marca("logo")} alt={loja.nome} className="h-11 max-w-[190px] object-contain md:h-12" />
            ) : (
              <span className="truncate text-lg font-bold tracking-tight">{loja.nome}</span>
            )}
          </Link>

          <nav aria-label="Menu da loja" className="hidden items-center gap-1 text-sm md:flex">
            {itens.map((i) => (
              <Link key={i.href} href={i.href} aria-current={i.ativo ? "page" : undefined} className={`relative whitespace-nowrap rounded-full px-4 py-2 font-medium transition ${i.ativo ? "" : escuro ? "text-neutral-300 hover:bg-white/10 hover:text-white" : "text-neutral-600 hover:bg-neutral-100"}`} style={i.ativo ? { background: "var(--loja)", color: "var(--loja-texto)" } : undefined}>
                {i.rotulo}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            {zap && (
              <BotaoWhatsapp href={zap} className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-3.5 py-2 text-sm font-semibold text-white shadow hover:opacity-90 md:px-5">
                <span className="hidden sm:inline">Falar no WhatsApp</span>
                <span className="sm:hidden">WhatsApp</span>
              </BotaoWhatsapp>
            )}
            <MenuMovel itens={itens} claro={!escuro} />
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className={`mt-14 ${escuro ? "text-neutral-200" : "border-t border-neutral-200 bg-surface"}`} style={escuro ? { background: "var(--loja-mais-escuro)" } : undefined}>
        <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, var(--loja), var(--loja2))" }} />
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            {loja.temLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={marca("logo")} alt={loja.nome} className="h-10 max-w-[170px] object-contain object-left" loading="lazy" />
            ) : (
              <p className="text-base font-bold">{loja.nome}</p>
            )}
            {loja.endereco && <p className={`mt-3 ${sub}`}>{loja.endereco}</p>}
            <div className="mt-3 flex gap-3">
              {loja.instagram && (
                <a href={loja.instagram} target="_blank" rel="noreferrer me" className="font-medium hover:underline" style={{ color: "var(--loja2)" }}>Instagram</a>
              )}
              {loja.facebook && (
                <a href={loja.facebook} target="_blank" rel="noreferrer me" className="font-medium hover:underline" style={{ color: "var(--loja2)" }}>Facebook</a>
              )}
            </div>
          </div>
          <div>
            <p className="font-semibold">Navegue</p>
            <ul className={`mt-2 flex flex-col gap-1.5 ${sub}`}>
              {itens.map((i) => (
                <li key={i.href}><Link href={i.href} className="hover:underline">{i.rotulo}</Link></li>
              ))}
              <li><Link href={caminho("privacidade")} className="hover:underline">Política de privacidade</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Fale com a gente</p>
            {loja.whatsapp && (
              <a href={linkWhatsapp(loja.whatsapp, `Olá! Vi o site da ${loja.nome}.`)} target="_blank" rel="noreferrer" className={`mt-2 block ${sub} hover:underline`}>
                WhatsApp {formatarWhatsapp(loja.whatsapp)}
              </a>
            )}
            <Link href={caminho("localizacao")} className={`mt-1.5 block ${sub} hover:underline`}>Como chegar</Link>
          </div>
          {loja.horario.length > 0 && (
            <div>
              <p className="font-semibold">Horário de atendimento</p>
              <ul className={`mt-2 ${sub}`}>
                {loja.horario.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-neutral-500">Preços e disponibilidade sujeitos a alteração sem aviso. Confirme pelo WhatsApp. Marcas e logotipos pertencem às respectivas montadoras.</p>
      </footer>

      {zap && <BotaoFlutuante href={zap} subirNoCelular={subirBotao} />}
    </div>
  );
}

/** Título e texto de abertura de uma página interna. */
export function CabecalhoDaPagina({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <div className="border-b border-neutral-200 bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{titulo}</h1>
        <div className="mt-3 h-1 w-14 rounded-full" style={{ background: "var(--loja2)" }} />
        {texto && <p className="mt-3 max-w-2xl text-sm text-neutral-600 md:text-base">{texto}</p>}
      </div>
    </div>
  );
}
