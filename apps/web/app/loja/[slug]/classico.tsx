import Link from "next/link";
import type { LojaPublica } from "@/lib/vitrine";
import { IconeWhatsapp } from "./comum";
import { MenuMovel } from "./menu-movel";
import { BotaoWhatsapp } from "./rastreio";
import { MenuFixo } from "./menu-fixo";

/**
 * Estilo "clássico" do site (Aparência > Estilo do site): o jeito dos sites AutoCerto, que é a
 * identidade que as lojas e os clientes delas já conhecem. Faixa na cor da loja com o logo, o
 * endereço e os telefones; o menu numa faixa da segunda cor, com ícones; abas de Facebook,
 * Instagram e WhatsApp presas na lateral.
 */

type Item = { rotulo: string; href: string; ativo: boolean; aba: string };
type Tel = { tipo: string; numero: string };

const formatar = (n: string) => n.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

const ICONES: Record<string, string> = {
  vitrine: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z",
  veiculos: "M5 13l1.6-4.3A2 2 0 0 1 8.5 7.4h7a2 2 0 0 1 1.9 1.3L19 13M4 13h16v4a1 1 0 0 1-1 1h-1.5M4 13v4a1 1 0 0 0 1 1h1.5M7.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  "quem-somos": "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18",
  "venda-seu-carro": "M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  financiamento: "M3 6h18v12H3zM3 10h18M7 15h4",
  localizacao: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
};

function Icone({ aba }: { aba: string }) {
  const d = ICONES[aba];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** "Av. X, nº 1120" e "Bairro - Cidade - UF", como no site antigo. */
function linhasDoEndereco(loja: LojaPublica): string[] {
  const p = loja.enderecoPartes;
  if (p.logradouro || p.cidade) return [p.logradouro, [p.bairro, p.cidade, p.uf].filter(Boolean).join(" - ")].filter((l): l is string => !!l);
  return loja.endereco ? loja.endereco.split(/\s+·\s+/).slice(0, 2) : [];
}

export function CabecalhoClassico({ loja, itens, telefones, linkDoTelefone, logo }: { loja: LojaPublica; itens: Item[]; telefones: Tel[]; linkDoTelefone: (t: Tel) => string; logo: string | null }) {
  const endereco = linhasDoEndereco(loja);
  const inicio = itens.find((i) => i.aba === "vitrine")?.href ?? "/";
  const zap = telefones.find((t) => t.tipo === "WHATSAPP");
  return (
    <>
      <header className="sticky top-0 z-30 md:relative" style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:py-4">
          <Link href={inicio} className="flex min-w-0 items-center" aria-label={`${loja.nome}: página inicial`}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={loja.nome} className="h-14 max-w-[230px] object-contain object-left md:h-[88px] md:max-w-[380px]" />
            ) : (
              <span className="truncate text-2xl font-extrabold uppercase tracking-tight">{loja.nome}</span>
            )}
          </Link>

          <div className="hidden items-start gap-10 md:flex">
            {endereco.length > 0 && (
              <div className="text-right">
                <p className="text-base font-semibold" style={{ color: "var(--loja2)" }}>Endereço</p>
                {endereco.map((l) => <p key={l} className="text-[15px] font-semibold leading-snug">{l}</p>)}
              </div>
            )}
            {telefones.length > 0 && (
              <div>
                <p className="text-base font-semibold" style={{ color: "var(--loja2)" }}>Telefone</p>
                <ul className="flex flex-col">
                  {telefones.map((t, i) => (
                    <li key={`${t.numero}-${i}`}>
                      <a href={linkDoTelefone(t)} target={t.tipo === "WHATSAPP" ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-2 text-[15px] font-semibold leading-snug hover:underline">
                        {formatar(t.numero)}
                        {t.tipo === "WHATSAPP" && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#25D366] text-white"><IconeWhatsapp className="h-3.5 w-3.5" /></span>}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 md:hidden">
            {zap && (
              <BotaoWhatsapp href={linkDoTelefone(zap)} className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-2 text-sm font-semibold text-white">
                WhatsApp
              </BotaoWhatsapp>
            )}
            <MenuMovel itens={itens} claro={false} />
          </div>
        </div>
      </header>
      {/* No celular o menu abre pelo botão; a faixa da segunda cor mantém a identidade. */}
      <div className="h-1.5 md:hidden" style={{ background: "var(--loja2)" }} />

      <MenuFixo logo={logo} nome={loja.nome} inicio={inicio}>
        <ul className="flex flex-1 items-center justify-between">
          {itens.map((i) => (
            <li key={i.href}>
              <Link href={i.href} aria-current={i.ativo ? "page" : undefined} className={`flex items-center gap-2 whitespace-nowrap px-3 py-3 text-[17px] transition hover:bg-black/10 ${i.ativo ? "bg-black/10 font-semibold" : ""}`}>
                <Icone aba={i.aba} />
                {i.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </MenuFixo>
    </>
  );
}

/** As abas presas na lateral direita (computador): Facebook, Instagram e WhatsApp. */
export function AbasSociais({ loja, zap }: { loja: LojaPublica; zap: string | null }) {
  const abas = [
    loja.facebook && { nome: "Facebook", href: loja.facebook, fundo: "#1877F2", icone: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5Z" fill="currentColor" /> },
    loja.instagram && { nome: "Instagram", href: loja.instagram, fundo: "linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)", icone: <><rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="7" r="1.2" fill="currentColor" /></> },
  ].filter(Boolean) as { nome: string; href: string; fundo: string; icone: React.ReactNode }[];
  return (
    <div className="fixed right-0 top-1/3 z-30 hidden flex-col gap-1.5 md:flex">
      {abas.map((a) => (
        <a key={a.nome} href={a.href} target="_blank" rel="noreferrer me" aria-label={a.nome} className="flex h-14 w-14 items-center justify-center rounded-l-lg bg-neutral-800/85 shadow-lg transition hover:w-16">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: a.fundo }}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>{a.icone}</svg>
          </span>
        </a>
      ))}
      {zap && (
        <BotaoWhatsapp href={zap} className="flex h-14 w-14 items-center justify-center rounded-l-lg bg-neutral-800/85 text-[#25D366] shadow-lg transition hover:w-16 [&>svg]:h-9 [&>svg]:w-9">
          <span className="sr-only">WhatsApp</span>
        </BotaoWhatsapp>
      )}
    </div>
  );
}
