import Link from "next/link";
import type { LojaPublica } from "@/lib/vitrine";
import { IconeWhatsapp } from "./comum";

type Tel = { tipo: string; numero: string };

const formatar = (n: string) => n.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

/** O link do "Desenvolvido por Dilon Tech": a página de vendas do Zap para revendas, marcando de qual loja veio. */
export function linkDilonTech(slug: string) {
  return `https://zap.dilontech.com.br/revenda-de-veiculos?utm_source=site-loja&utm_medium=rodape&utm_campaign=${encodeURIComponent(slug)}`;
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--loja2)" }}>
      {children}
    </p>
  );
}

function Icone({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/**
 * O rodapé do site da loja: marca e redes, páginas, contato (todos os telefones, endereço e como
 * chegar) e horário; embaixo, os direitos, a privacidade e o "Desenvolvido por Dilon Tech".
 */
export function Rodape({ loja, itens, telefones, linkDoTelefone, logo, escuro, linkPrivacidade, linkLocalizacao }: { loja: LojaPublica; itens: { rotulo: string; href: string }[]; telefones: Tel[]; linkDoTelefone: (t: Tel) => string; logo: string | null; escuro: boolean; linkPrivacidade: string; linkLocalizacao: string }) {
  const sub = escuro ? "text-neutral-300" : "text-neutral-600";
  const linha = escuro ? "border-white/10" : "border-neutral-200";
  const resumo = (loja.sobre ?? loja.quemSomosTitulo ?? "").split(/\n/)[0].slice(0, 180);
  const ano = new Date().getFullYear();
  const redes = [
    loja.instagram && { nome: "Instagram", href: loja.instagram, d: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.5-1.5h.01" },
    loja.facebook && { nome: "Facebook", href: loja.facebook, d: "M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V9H7v3.5h2V21h3.5v-8.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15V3Z" },
  ].filter(Boolean) as { nome: string; href: string; d: string }[];

  return (
    <footer className={`mt-14 ${escuro ? "text-neutral-100" : "border-t border-neutral-200 bg-surface text-neutral-900"}`} style={escuro ? { background: "var(--loja-mais-escuro)" } : undefined}>
      <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, var(--loja), var(--loja2))" }} />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 text-sm sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1.2fr_1fr]">
        <div>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={loja.nome} className="h-14 max-w-[220px] object-contain object-left" loading="lazy" />
          ) : (
            <p className="text-lg font-extrabold uppercase">{loja.nome}</p>
          )}
          {resumo && <p className={`mt-4 leading-relaxed ${sub}`}>{resumo}</p>}
          {redes.length > 0 && (
            <div className="mt-5 flex gap-2">
              {redes.map((r) => (
                <a key={r.nome} href={r.href} target="_blank" rel="noreferrer me" aria-label={r.nome} className={`flex h-10 w-10 items-center justify-center rounded-full border transition hover:scale-105 ${escuro ? "border-white/20 hover:bg-white/10" : "border-neutral-300 hover:bg-neutral-100"}`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={r.d} /></svg>
                </a>
              ))}
            </div>
          )}
        </div>

        <nav aria-label="Páginas do site">
          <Titulo>Navegue</Titulo>
          <ul className={`flex flex-col gap-2 ${sub}`}>
            {itens.map((i) => (
              <li key={i.href}><Link href={i.href} className="transition hover:text-[var(--loja2)]">{i.rotulo}</Link></li>
            ))}
          </ul>
        </nav>

        <div>
          <Titulo>Contato</Titulo>
          <ul className={`flex flex-col gap-2.5 ${sub}`}>
            {telefones.map((t) => (
              <li key={t.numero}>
                <a href={linkDoTelefone(t)} target={t.tipo === "WHATSAPP" ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-2 transition hover:text-[var(--loja2)]">
                  {t.tipo === "WHATSAPP" ? <IconeWhatsapp className="h-4 w-4 shrink-0 text-[#25D366]" /> : <Icone d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />}
                  {formatar(t.numero)}
                </a>
              </li>
            ))}
            {loja.endereco && (
              <li className="flex gap-2">
                <Icone d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <span>
                  {loja.endereco.replace(/\s+·\s+/g, ", ")}
                  <Link href={linkLocalizacao} className="mt-1 block font-semibold" style={{ color: "var(--loja2)" }}>Como chegar →</Link>
                </span>
              </li>
            )}
          </ul>
        </div>

        {loja.horario.length > 0 && (
          <div>
            <Titulo>Horário</Titulo>
            <ul className={`flex flex-col gap-1.5 ${sub}`}>
              {loja.horario.map((h) => {
                const [dia, ...resto] = h.split(":");
                return resto.length ? (
                  <li key={h} className="flex justify-between gap-3"><span>{dia}</span><span className="font-medium">{resto.join(":").trim()}</span></li>
                ) : (
                  <li key={h}>{h}</li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className={`border-t ${linha}`}>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 text-xs md:flex-row md:items-center md:justify-between">
          <div className={escuro ? "text-neutral-400" : "text-neutral-500"}>
            <p>
              © {ano} {loja.nome}. Todos os direitos reservados. · <Link href={linkPrivacidade} className="underline-offset-2 hover:underline">Política de privacidade</Link>
            </p>
            <p className="mt-1">Preços e disponibilidade sujeitos a alteração sem aviso. Marcas e logotipos pertencem às respectivas montadoras.</p>
          </div>
          <a href={linkDilonTech(loja.slug)} target="_blank" rel="noopener" className={`flex shrink-0 items-center gap-2 transition hover:opacity-100 ${escuro ? "text-neutral-300 opacity-85" : "text-neutral-600 opacity-90"}`} aria-label="Desenvolvido por Dilon Tech: conheça o sistema para revendas">
            <span>Desenvolvido por</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/dilon-tech-simbolo.png" alt="" className="h-6 w-auto" loading="lazy" />
            <span className="text-sm font-bold tracking-tight">Dilon <span className="text-[#22d3ee]">Tech</span></span>
          </a>
        </div>
      </div>
    </footer>
  );
}
