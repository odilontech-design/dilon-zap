import type { Metadata } from "next";
import { numeroDoComercial, linkComMensagem } from "@/lib/suporte";
import { PACOTES_VENDEDOR_IA, PLANOS_VEICULOS, type PlanoVeiculos } from "@/lib/veiculos-planos";
import { FormularioCadastro } from "@/components/formulario-cadastro";
import { LogoDilon } from "../login/logo-dilon";

/**
 * Página comercial da vertical de revenda de veículos (briefing em
 * docs/landing-page-veiculos.md). Pública, fora da área logada.
 *
 * Os preços e limites vêm de lib/veiculos-planos: é a mesma tabela que o
 * sistema aplica, então a página nunca promete um limite que o produto não
 * cumpre. O formulário é o da demonstração gratuita (/api/cadastro), com o
 * ramo já marcado: o pedido cai na fila de aprovação do Super Admin, como os
 * do Zap.
 *
 * Só aparece o que o produto faz hoje. Portais, nota fiscal e RENAVE entram
 * aqui no dia em que estiverem em uso por um cliente.
 */

export const metadata: Metadata = {
  title: "Revenda de veículos — Dilon Tech",
  description: "Estoque com custo e margem, WhatsApp da loja, vendas, financeiro e site para revendas de seminovos.",
  openGraph: {
    title: "Revenda de veículos — Dilon Tech",
    description: "Estoque com custo e margem, WhatsApp da loja, vendas, financeiro e site para revendas de seminovos.",
    type: "website",
  },
};

// Paleta do site da Dilon Tech (dilontech.com.br): navy, teal, cinza-claro e tinta.
const NAVY = "#03254C";
const TEAL = "#00F5D4";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* ------------------------------------------------------------------ peças */

function Botao({ href, children, claro }: { href: string; children: React.ReactNode; claro?: boolean }) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition ${
        claro ? "border border-[#1A202C]/20 bg-white text-[#1A202C] hover:border-[#1A202C]/40" : "bg-[#00F5D4] text-[#03254C] hover:brightness-110"
      }`}
    >
      {children}
    </a>
  );
}

function Icone({ d }: { d: React.ReactNode }) {
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#00F5D4]/20 text-[#03254C]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        {d}
      </svg>
    </span>
  );
}

/** A ficha do carro com a venda aberta, desenhada (sem dado de cliente). */
function TelaDaVenda() {
  const linhas: [string, string][] = [
    ["Preço de venda", "R$ 92.900"],
    ["Carro na troca (Gol 2015)", "− R$ 30.000"],
    ["Sinal (já no caixa)", "− R$ 2.000"],
    ["Entrada no Pix", "− R$ 10.900"],
    ["Financiado (banco paga em 15 dias)", "− R$ 40.000"],
  ];
  return (
    <div className="w-full max-w-md rounded-2xl border border-[#1A202C]/10 bg-white p-5 shadow-xl shadow-[#1A202C]/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#03254C]/70">Reservado · 12 dias em estoque</p>
          <p className="mt-1 text-lg font-semibold text-[#1A202C]">Volkswagen Polo TSI 2022/2023</p>
          <p className="text-xs text-[#1A202C]/60">28.500 km · Automático · FIPE −2,1%</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-[#1A202C]">R$ 92.900</p>
          <p className="text-xs font-medium text-emerald-700">Margem R$ 11.300 (12,2%)</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-1.5 border-t border-[#1A202C]/10 pt-4 text-sm">
        {linhas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-[#1A202C]/80">
            <span>{k}</span>
            <span className="tabular-nums">{v}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between rounded-lg bg-[#00F5D4]/15 px-3 py-2 font-semibold text-[#03254C]">
          <span>Crediário da loja: 2 × mensal</span>
          <span className="tabular-nums">R$ 10.000</span>
        </div>
      </div>
      <div className="mt-4 rounded-lg bg-[#03254C] py-2.5 text-center text-sm font-semibold text-white">Registrar venda</div>
    </div>
  );
}

/** A conversa do "ainda tem?", desenhada em balões. */
function Conversa() {
  const balao = "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm";
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-2 rounded-2xl bg-[#ECE5DD] p-4">
      <div className={`${balao} self-start rounded-tl-sm bg-white text-[#1A202C]`}>Boa tarde! Ainda tem o Polo branco?</div>
      <div className={`${balao} self-end rounded-tr-sm bg-[#DCF8C6] p-1.5 text-[#1A202C]`}>
        <div className="flex h-32 items-end rounded-xl bg-gradient-to-br from-slate-300 via-slate-200 to-slate-400 p-2">
          <span className="rounded bg-black/50 px-1.5 text-[10px] text-white">1/5</span>
        </div>
        <div className="px-2 pb-1 pt-2 leading-snug">
          <p className="font-semibold">Volkswagen Polo TSI 1.0 2022/2023</p>
          <p>💰 R$ 92.900,00</p>
          <p>📍 28.500 km</p>
          <p>Automático · Flex · Branco</p>
          <p>✅ Ar-condicionado, Multimídia, Câmera de ré</p>
          <p className="text-[#0a6aa1] underline">www.sualoja.com.br/…</p>
        </div>
      </div>
      <div className={`${balao} self-end rounded-tr-sm bg-[#DCF8C6] text-[#1A202C]`}>Tem sim! Quer vir ver amanhã de manhã?</div>
    </div>
  );
}

/* ----------------------------------------------------------------- página */

const PROBLEMAS: [string, string][] = [
  ["O celular de cada vendedor", "O lead do portal cai no WhatsApp pessoal. Quando o vendedor sai, as conversas vão junto."],
  ["A cabeça do dono", "Quanto o carro custou com oficina, despachante e polimento: ninguém soma até vender."],
  ["O pátio", "O carro parado há 70 dias só aparece quando alguém tropeça nele."],
  ["O caderno", "Sinal, troca, parcela do banco e repasse do consignado anotados à parte, cada um num canto."],
];

const RECURSOS: { titulo: string; texto: string; icone: React.ReactNode }[] = [
  { titulo: "Estoque com custo e margem", texto: "Compra, oficina, despachante e polimento por carro. A margem real aparece na ficha, antes de dar o desconto.", icone: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></> },
  { titulo: "Carro parado não passa batido", texto: "Dias em estoque com alerta em 30, 60 e 90 dias e o preço comparado com a FIPE.", icone: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { titulo: "Reserva com sinal", texto: "O sinal cai no caixa do dia. Desistiu? Você escolhe devolver ou ficar com ele.", icone: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></> },
  { titulo: "Venda como ela acontece", texto: "Entrada, carro na troca, financiamento do banco e crediário da loja na mesma venda. A troca entra no estoque sozinha.", icone: <><path d="M4 7h16M4 12h10M4 17h7" /></> },
  { titulo: "Consignado sem caderno", texto: "O dono do carro, o valor combinado e o repasse lançado em contas a pagar no dia da venda.", icone: <><path d="M16 11V7a4 4 0 0 0-8 0v4" /><rect x="5" y="11" width="14" height="10" rx="2" /></> },
  { titulo: "O site da sua revenda", texto: "O estoque no seu domínio, no Google com preço e foto, e o botão “Tenho interesse” abrindo o WhatsApp com o carro na mensagem.", icone: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></> },
  { titulo: "Anúncio no Facebook e Instagram", texto: "O estoque vira catálogo de anúncios, sempre atualizado: vendeu, sai do anúncio.", icone: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /></> },
  { titulo: "Traga seu estoque de onde estiver", texto: "Importação da planilha com fotos, sem cadastrar carro por carro.", icone: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></> },
  { titulo: "Vendedor IA", texto: "Responde o primeiro contato a qualquer hora com o estoque real e passa para o vendedor quando o cliente quer negociar.", icone: <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01" /></> },
];

const PASSOS: [string, string][] = [
  ["Traga o estoque", "Envie a planilha que você já tem. O sistema reconhece as colunas e mostra o que vai entrar antes de gravar."],
  ["Conecte o WhatsApp da loja", "Leia o QR Code com o celular da loja. A equipe toda atende no mesmo número."],
  ["Coloque o site no ar", "Aponte o domínio da loja e ligue a vitrine. O cadeado de segurança é automático."],
  ["Venda e receba", "Reserva, venda, troca e financiamento caem no financeiro sem redigitar."],
];

const PERGUNTAS: [string, string][] = [
  ["Preciso largar o sistema que uso hoje?", "Não no primeiro dia. A implantação é em etapas: o WhatsApp e o estoque entram primeiro, e o que funciona hoje só é trocado quando o substituto estiver rodando."],
  ["Meu estoque está em outro sistema. Vou ter que cadastrar tudo de novo?", "Não. Exporte a planilha do sistema atual e importe. As fotos vêm junto pelos links."],
  ["Funciona com o WhatsApp que a loja já usa?", "Funciona. Você conecta o número da loja pelo QR Code, como no WhatsApp Web, e a equipe atende por ele no computador ou no celular."],
  ["O vendedor vê quanto o carro custou?", "Não. Custo, margem e o menor preço aceito só aparecem para quem é da gestão."],
  ["O site substitui o que eu tenho hoje?", "Pode substituir. Ele fica no seu domínio e você decide quando apontar. Até lá, roda num endereço provisório para você testar."],
  ["E o RENAVE, a nota fiscal e os portais?", "Continuam com quem faz hoje (despachante, contador, o integrador de anúncios atual). O estoque, o WhatsApp, a venda, o financeiro, o site e o catálogo do Facebook e Instagram ficam no sistema."],
  ["O Vendedor IA pode falar besteira para o cliente?", "Ele só fala de carros que estão no estoque, não negocia preço e passa para o vendedor tudo o que for negociação, financiamento ou troca. Você vê cada conversa no painel e desliga quando quiser."],
];

const LINHAS_DO_PLANO: { rotulo: string; valor: (p: PlanoVeiculos) => string }[] = [
  { rotulo: "Carros em estoque", valor: (p) => `até ${PLANOS_VEICULOS[p].carrosNoPatio}` },
  { rotulo: "Usuários", valor: () => "ilimitados" },
  { rotulo: "Estoque com custo, margem e FIPE", valor: () => "✓" },
  { rotulo: "WhatsApp da loja com toda a equipe", valor: () => "✓" },
  { rotulo: "Reserva, venda, troca e financeiro", valor: () => "✓" },
  { rotulo: "CRM de vendas com funil e tarefas", valor: () => "✓" },
  { rotulo: "Site da loja no seu domínio", valor: () => "✓" },
  { rotulo: "Importação de planilha com fotos", valor: () => "✓" },
  { rotulo: "Catálogo para Facebook e Instagram", valor: (p) => (PLANOS_VEICULOS[p].catalogoMeta ? "✓" : "—") },
  { rotulo: "Mais de um número de WhatsApp", valor: (p) => (PLANOS_VEICULOS[p].multiNumero ? "✓" : "—") },
];

export default function RevendaDeVeiculosPage() {
  const numero = numeroDoComercial();
  const whatsapp = numero ? linkComMensagem(numero, "Olá! Tenho uma revenda de veículos e quero conhecer o sistema da Dilon Tech.") : null;
  const planos = Object.keys(PLANOS_VEICULOS) as PlanoVeiculos[];

  return (
    <div className="tema-comercial min-h-screen bg-[#F4F6F9] text-[#1A202C]">
      {/* Topo */}
      <header className="sticky top-0 z-20 border-b border-[#1A202C]/10 bg-[#F4F6F9]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="https://dilontech.com.br" aria-label="Dilon Tech">
            <LogoDilon />
          </a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/login" className="hidden text-[#1A202C]/70 hover:text-[#1A202C] sm:inline">
              Entrar
            </a>
            <Botao href="#contato">Falar com a Dilon Tech</Botao>
          </nav>
        </div>
      </header>

      {/* 1. Herói */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:py-20">
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>
            Para revendas de seminovos
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">A venda acontece no WhatsApp. O resto também devia.</h1>
          <p className="text-lg text-[#1A202C]/75">
            Estoque com custo e margem, o WhatsApp da loja com toda a equipe, reserva, venda e financeiro num sistema só, mais o site da sua revenda no seu domínio.
          </p>
          <div className="flex flex-wrap gap-3">
            <Botao href="#contato">Falar com a Dilon Tech</Botao>
            <Botao href="#como-funciona" claro>
              Ver como funciona
            </Botao>
          </div>
        </div>
        <div className="flex justify-center md:justify-end">
          <TelaDaVenda />
        </div>
      </section>

      {/* 2. O problema */}
      <section className="bg-[#03254C] text-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight">Hoje a sua venda está espalhada em quatro lugares</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROBLEMAS.map(([t, d]) => (
              <div key={t} className="rounded-xl bg-white/5 p-5">
                <p className="font-semibold">{t}</p>
                <p className="mt-2 text-sm text-white/70">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-white/80">
            O custo disso não aparece em lugar nenhum: lead que esfriou sem resposta, carro vendido abaixo do que custou e dinheiro parado no pátio.
          </p>
        </div>
      </section>

      {/* 3. O diferencial */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2">
        <div className="order-2 md:order-1">
          <Conversa />
        </div>
        <div className="order-1 flex flex-col gap-4 md:order-2">
          <h2 className="text-3xl font-bold tracking-tight">O “ainda tem?” respondido em dois cliques</h2>
          <p className="text-[#1A202C]/75">
            O sistema de revenda comum é feito para o escritório, e o WhatsApp fica de fora, como um botão. Aqui é o contrário: o WhatsApp da loja é o centro, e o estoque está
            dentro da conversa.
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {[
              "O vendedor procura o carro sem sair da conversa, e a ficha e as fotos vão juntas.",
              "Todo mundo atende no número da loja, e o histórico fica com a loja.",
              "Se ninguém respondeu, o sistema avisa o vendedor e o dono.",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden style={{ color: NAVY }}>
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4. Recursos */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-3xl font-bold tracking-tight">Tudo o que a revenda usa no dia</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RECURSOS.map((r) => (
            <div key={r.titulo} className="flex flex-col gap-3 rounded-xl border border-[#1A202C]/10 bg-white p-5">
              <Icone d={r.icone} />
              <p className="font-semibold">{r.titulo}</p>
              <p className="text-sm text-[#1A202C]/70">{r.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Como funciona */}
      <section id="como-funciona" className="scroll-mt-20 border-y border-[#1A202C]/10 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Como funciona</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {PASSOS.map(([t, d], i) => (
              <li key={t} className="flex flex-col gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: NAVY }}>
                  {i + 1}
                </span>
                <p className="font-semibold">{t}</p>
                <p className="text-sm text-[#1A202C]/70">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 6. Vendedor IA */}
      <section className="bg-[#03254C] text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: TEAL }}>
              Vendedor IA
            </p>
            <h2 className="text-3xl font-bold tracking-tight">Lead respondido às 23h de domingo</h2>
            <p className="text-white/80">
              O Vendedor IA atende o WhatsApp da loja quando a equipe não está: consulta o estoque de verdade, manda o carro certo e faz as perguntas que o vendedor faria
              (entrada, troca, dia da visita). Quando o cliente quer negociar, ele passa a conversa para um vendedor com um resumo pronto. Assim que alguém da equipe responde,
              ele sai da conversa.
            </p>
          </div>
          <ul className="flex flex-col justify-center gap-3">
            {[
              "Só fala de carros que estão no estoque: não inventa preço nem condição.",
              "Não dá desconto nem promete nada: negociação é com o vendedor.",
              "O painel mostra cada conversa atendida, o que foi passado ao vendedor e o custo do mês.",
            ].map((t) => (
              <li key={t} className="rounded-xl bg-white/5 p-4 text-sm">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. Planos */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold tracking-tight">Planos</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {planos.map((p) => {
            const destaque = p === "REVENDA";
            return (
              <div key={p} className={`relative flex flex-col rounded-2xl border bg-white p-6 ${destaque ? "border-[#00F5D4] border-2 shadow-lg shadow-[#00F5D4]/20" : "border-[#1A202C]/10"}`}>
                {destaque && (
                  <span className="absolute -top-3 left-6 rounded-full px-3 py-0.5 text-xs font-semibold" style={{ background: TEAL, color: NAVY }}>
                    mais escolhido
                  </span>
                )}
                <p className="text-lg font-semibold">{PLANOS_VEICULOS[p].nome}</p>
                <p className="mt-1">
                  <span className="text-3xl font-bold">{brl(PLANOS_VEICULOS[p].mensalCents)}</span>
                  <span className="text-sm text-[#1A202C]/60">/mês</span>
                </p>
                <ul className="mt-5 flex flex-col gap-2 text-sm">
                  {LINHAS_DO_PLANO.map((l) => {
                    const v = l.valor(p);
                    return (
                      <li key={l.rotulo} className={`flex justify-between gap-3 ${v === "—" ? "text-[#1A202C]/35" : ""}`}>
                        <span>{l.rotulo}</span>
                        <span className="shrink-0 font-medium" style={v === "✓" ? { color: NAVY } : undefined}>
                          {v}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-6">
                  <Botao href="#contato" claro={!destaque}>
                    Quero o {PLANOS_VEICULOS[p].nome}
                  </Botao>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 rounded-xl border border-[#1A202C]/10 bg-white p-5 text-sm">
          <p className="font-semibold">Adicional para qualquer plano: Vendedor IA</p>
          <p className="mt-1 text-[#1A202C]/75">
            {PACOTES_VENDEDOR_IA.map((x) => `${brl(x.mensalCents)}/mês até ${x.leads.toLocaleString("pt-BR")} leads atendidos`).join(" · ")}
          </p>
        </div>
        <p className="mt-4 text-sm text-[#1A202C]/70">
          Usuários ilimitados em todos os planos. Na revenda, quem atende é a equipe inteira, e cobrar por acesso faria o dono escolher quem pode responder o cliente.
        </p>
      </section>

      {/* 8. Perguntas */}
      <section className="border-t border-[#1A202C]/10 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-3xl font-bold tracking-tight">Perguntas frequentes</h2>
          <div className="mt-6 divide-y divide-[#1A202C]/10">
            {PERGUNTAS.map(([p, r]) => (
              <details key={p} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                  {p}
                  <span aria-hidden className="text-xl leading-none transition group-open:rotate-45" style={{ color: NAVY }}>
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm text-[#1A202C]/75">{r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Chamada final + contato */}
      <section id="contato" className="scroll-mt-20 bg-[#03254C] text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-bold tracking-tight">Comece pelo seu estoque</h2>
            <p className="text-white/80">
              Mande a planilha do estoque que você usa hoje. A gente coloca no ar com o seu WhatsApp e mostra a primeira semana de números: leads atendidos, tempo de resposta e
              margem por carro.
            </p>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="w-fit rounded-lg bg-[#25D366] px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
                Prefere conversar? Chame no WhatsApp
              </a>
            )}
          </div>
          {numero && (
            <div className="rounded-2xl bg-white p-5 text-[#1A202C]">
              <FormularioCadastro numero={numero} ramoInicial="Revenda de veículos" />
            </div>
          )}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-[#1A202C]/60">
        <span>© {new Date().getFullYear()} Dilon Tech</span>
        <a href="https://dilontech.com.br" className="hover:text-[#1A202C]">
          dilontech.com.br
        </a>
      </footer>
    </div>
  );
}
