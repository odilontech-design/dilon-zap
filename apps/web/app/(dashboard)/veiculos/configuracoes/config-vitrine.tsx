"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, campo, erroDaResposta, fetcher, rotulo, secao } from "../comum";
import { ImagemDaMarca } from "./imagem-da-marca";

type Config = {
  vitrineAtiva: boolean;
  whatsapp: string | null;
  nomeLoja: string | null;
  endereco: string | null;
  sobre: string | null;
  mostrarReservados: boolean;
  dominio: string | null;
  metaPixelId: string | null;
  ga4Id: string | null;
  formularioAtivo: boolean;
  exigirKm: boolean;
  cabecalhoClaro: boolean;
  corSecundaria: string | null;
  corPrimaria: string | null;
  horario: string | null;
  instagram: string | null;
  facebook: string | null;
  politicaPrivacidade: string | null;
  temLogo: boolean;
  temBanner: boolean;
  slug: string;
  linkSemDominio: string;
  hostDoSistema: string | null;
  feeds: { facebook: string | null; xml: string; json: string };
  link: string;
  nomeEmpresa: string;
  numeroConectado: string | null;
};

/** Liga a vitrine pública e define o que ela mostra sobre a loja. */
export function ConfigVitrine() {
  const { data, error, mutate } = useSWR<Config>("/api/veiculos/config", fetcher);
  const [f, setF] = useState({ vitrineAtiva: false, whatsapp: "", nomeLoja: "", endereco: "", sobre: "", mostrarReservados: true, dominio: "", metaPixelId: "", ga4Id: "", formularioAtivo: true, exigirKm: true, cabecalhoClaro: false, corSecundaria: "", corPrimaria: "", horario: "", instagram: "", facebook: "", politicaPrivacidade: "" });
  const [versaoImagens, setVersaoImagens] = useState(0);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (data)
      setF({
        vitrineAtiva: data.vitrineAtiva,
        whatsapp: data.whatsapp ?? "",
        nomeLoja: data.nomeLoja ?? "",
        endereco: data.endereco ?? "",
        sobre: data.sobre ?? "",
        mostrarReservados: data.mostrarReservados,
        dominio: data.dominio ?? "",
        metaPixelId: data.metaPixelId ?? "",
        ga4Id: data.ga4Id ?? "",
        formularioAtivo: data.formularioAtivo,
        exigirKm: data.exigirKm,
        cabecalhoClaro: data.cabecalhoClaro ?? false,
        corSecundaria: data.corSecundaria ?? "",
        corPrimaria: data.corPrimaria ?? "",
        horario: data.horario ?? "",
        instagram: data.instagram ?? "",
        facebook: data.facebook ?? "",
        politicaPrivacidade: data.politicaPrivacidade ?? "",
      });
  }, [data]);

  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-neutral-500">Carregando…</p>;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);
    setSalvando(true);
    const r = await fetch("/api/veiculos/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setSalvando(false);
    if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
    setAviso({ texto: f.vitrineAtiva ? "Vitrine no ar." : "Configuração salva. A vitrine está desligada." });
    mutate();
  }

  return (
    <form onSubmit={salvar} className="flex max-w-2xl flex-col gap-4">
      <section className={secao}>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={f.vitrineAtiva} onChange={(e) => setF({ ...f, vitrineAtiva: e.target.checked })} />
          Vitrine pública ligada
        </label>
        <p className="text-xs text-neutral-500">
          Uma página aberta na internet com os carros disponíveis, fotos, preço e o botão “Tenho interesse”, que abre o WhatsApp da loja com o carro já na mensagem. Não mostra custo,
          placa inteira, chassi nem nada interno. Para esconder um carro específico, desmarque “Mostrar na vitrine” na ficha dele.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-neutral-100 px-2 py-1 text-xs">{data.link}</code>
          <button type="button" className={botaoSecundario} onClick={() => navigator.clipboard?.writeText(data.link).then(() => setAviso({ texto: "Link copiado." }))}>
            Copiar link
          </button>
          {data.vitrineAtiva && (
            <a href={data.link} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
              Abrir vitrine
            </a>
          )}
        </div>
      </section>

      <section className={secao}>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Nome da loja na vitrine</span>
          <input id="vitrine-nome" value={f.nomeLoja} onChange={(e) => setF({ ...f, nomeLoja: e.target.value })} placeholder={data.nomeEmpresa} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>WhatsApp do botão “Tenho interesse”</span>
          <input id="vitrine-whatsapp" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder={data.numeroConectado ? `vazio = número conectado (${data.numeroConectado})` : "DDD + número"} inputMode="tel" className={campo} />
          {!f.whatsapp && !data.numeroConectado && <span className="text-xs text-amber-700">Sem número conectado e sem WhatsApp aqui, a vitrine fica sem o botão.</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Endereço</span>
          <input id="vitrine-endereco" value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} placeholder="Av. Brasil, 1000 · Centro · Cidade/UF" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Sobre a loja</span>
          <textarea id="vitrine-sobre" rows={3} value={f.sobre} onChange={(e) => setF({ ...f, sobre: e.target.value })} placeholder="Seminovos revisados, financiamento em até 60x, aceitamos seu usado na troca." className={campo} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.mostrarReservados} onChange={(e) => setF({ ...f, mostrarReservados: e.target.checked })} />
          Mostrar carros reservados (com o selo “Reservado”)
        </label>
      </section>

      <section className={secao}>
        <h2 className="text-sm font-semibold">Aparência</h2>
        <p className="text-xs text-neutral-500">Logo, banner e cor do site da loja. Aparecem na vitrine e nas páginas de Venda seu carro, Financiamento, Localização e Privacidade.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImagemDaMarca tipo="logo" titulo="Logo" dica="PNG, JPG ou WEBP, até 3 MB. Fundo transparente fica melhor." slug={data.slug} tem={data.temLogo} versao={versaoImagens} onMudou={() => { setVersaoImagens((v) => v + 1); mutate(); }} onAviso={setAviso} />
          <ImagemDaMarca tipo="banner" titulo="Banner da página inicial" dica="PNG, JPG ou WEBP, até 6 MB. Largura de 1600 px ou mais." slug={data.slug} tem={data.temBanner} versao={versaoImagens} onMudou={() => { setVersaoImagens((v) => v + 1); mutate(); }} onAviso={setAviso} />
        </div>
        <label className="flex flex-col gap-1" htmlFor="vitrine-cor">
          <span className={rotulo}>Cor da loja</span>
          <div className="flex items-center gap-2">
            <input aria-label="Escolher cor" type="color" value={/^#[0-9a-fA-F]{6}$/.test(f.corPrimaria) ? f.corPrimaria : "#1f6f4a"} onChange={(e) => setF({ ...f, corPrimaria: e.target.value })} className="h-10 w-14 cursor-pointer rounded border border-neutral-300 bg-surface p-1" />
            <input id="vitrine-cor" value={f.corPrimaria} onChange={(e) => setF({ ...f, corPrimaria: e.target.value })} placeholder="#1f6f4a (vazio = verde padrão)" className={`${campo} max-w-[240px]`} />
          </div>
          <span className="text-xs text-neutral-500">Usada no menu, nos botões e na faixa de abertura. O texto sobre a cor muda sozinho (claro ou escuro) para continuar legível.</span>
        </label>
        <label className="flex flex-col gap-1" htmlFor="vitrine-cor2">
          <span className={rotulo}>Segunda cor (destaque)</span>
          <div className="flex items-center gap-2">
            <input aria-label="Escolher segunda cor" type="color" value={/^#[0-9a-fA-F]{6}$/.test(f.corSecundaria) ? f.corSecundaria : "#ffc800"} onChange={(e) => setF({ ...f, corSecundaria: e.target.value })} className="h-10 w-14 cursor-pointer rounded border border-neutral-300 bg-surface p-1" />
            <input id="vitrine-cor2" value={f.corSecundaria} onChange={(e) => setF({ ...f, corSecundaria: e.target.value })} placeholder="#ffc800 (vazio = só a cor da loja)" className={`${campo} max-w-[240px]`} />
          </div>
          <span className="text-xs text-neutral-500">Para lojas com duas cores (ex.: vermelho e amarelo): a primeira vira o fundo do cabeçalho e da abertura; a segunda, os botões de chamada, o menu ativo e os selos.</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.cabecalhoClaro} onChange={(e) => setF({ ...f, cabecalhoClaro: e.target.checked })} />
          Cabeçalho e rodapé claros (desmarcado = escuro, que valoriza logos claras ou prateadas)
        </label>
      </section>

      <section className={secao}>
        <h2 className="text-sm font-semibold">Horário e redes sociais</h2>
        <label className="flex flex-col gap-1" htmlFor="vitrine-horario">
          <span className={rotulo}>Horário de funcionamento</span>
          <textarea id="vitrine-horario" rows={3} value={f.horario} onChange={(e) => setF({ ...f, horario: e.target.value })} placeholder={"Segunda a sexta, das 8h às 18h\nSábado, das 8h às 12h"} className={campo} />
          <span className="text-xs text-neutral-500">Uma faixa por linha.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1" htmlFor="vitrine-instagram">
            <span className={rotulo}>Instagram</span>
            <input id="vitrine-instagram" value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} placeholder="@sualoja" className={campo} />
          </label>
          <label className="flex flex-col gap-1" htmlFor="vitrine-facebook">
            <span className={rotulo}>Facebook</span>
            <input id="vitrine-facebook" value={f.facebook} onChange={(e) => setF({ ...f, facebook: e.target.value })} placeholder="nome da página ou endereço" className={campo} />
          </label>
        </div>
      </section>

      <section className={secao}>
        <h2 className="text-sm font-semibold">Domínio próprio</h2>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Endereço do site da loja</span>
          <input id="vitrine-dominio" value={f.dominio} onChange={(e) => setF({ ...f, dominio: e.target.value })} placeholder="www.sualoja.com.br" className={campo} />
        </label>
        <p className="text-xs text-neutral-500">
          No painel onde o domínio foi registrado (Registro.br, GoDaddy, Hostinger…), crie um registro <strong>CNAME</strong> de <code>{f.dominio || "www.sualoja.com.br"}</code> apontando
          para <code>{data.hostDoSistema ?? "o endereço do Zap"}</code>. Depois que o DNS propagar (de minutos a algumas horas), o site abre com cadeado (HTTPS) automático. Até lá, a
          vitrine continua em <code>{data.linkSemDominio}</code>.
        </p>
        <p className="text-xs text-amber-700">
          Atenção: apontar o domínio tira do ar o site atual da loja nesse endereço. Faça isso só quando a vitrine estiver pronta para substituí-lo.
        </p>
      </section>

      <section className={secao}>
        <h2 className="text-sm font-semibold">Leads e anúncios</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.formularioAtivo} onChange={(e) => setF({ ...f, formularioAtivo: e.target.checked })} />
          Formulário “Quero ser chamado” na página do carro (vira negociação no CRM, com a tarefa de chamar no WhatsApp)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>ID do Pixel do Facebook/Instagram</span>
            <input id="vitrine-pixel" value={f.metaPixelId} onChange={(e) => setF({ ...f, metaPixelId: e.target.value })} placeholder="só números" inputMode="numeric" className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>ID do Google Analytics 4</span>
            <input id="vitrine-ga4" value={f.ga4Id} onChange={(e) => setF({ ...f, ga4Id: e.target.value })} placeholder="G-XXXXXXXXXX" className={campo} />
          </label>
        </div>
        <p className="text-xs text-neutral-500">Com o pixel, cada clique em “Tenho interesse” conta como contato e cada formulário como lead: dá para anunciar para quem viu um carro e não chamou.</p>
        <div className="flex flex-col gap-1 text-xs">
          <span className={rotulo}>Feeds do estoque (atualizados sozinhos, só o que a vitrine mostra)</span>
          {!data.feeds.facebook && <span className="text-amber-700">O catálogo do Facebook e Instagram vem no plano Revenda. Fale com a Dilon Tech para mudar de plano.</span>}
          {(
            [
              ...(data.feeds.facebook ? [["Catálogo do Facebook e Instagram (CSV)", data.feeds.facebook] as const] : []),
              ["XML para integradores e portais", data.feeds.xml] as const,
              ["JSON", data.feeds.json] as const,
            ]
          ).map(([nome, url]) => (
            <div key={url} className="flex flex-wrap items-center gap-2">
              <span className="text-neutral-600">{nome}:</span>
              <code className="break-all rounded bg-neutral-100 px-1.5 py-0.5">{url}</code>
              <button type="button" className="text-accent hover:underline" onClick={() => navigator.clipboard?.writeText(url).then(() => setAviso({ texto: "Link copiado." }))}>
                copiar
              </button>
            </div>
          ))}
          <span className="text-neutral-500">No Gerenciador de Comércio da Meta: Catálogos → Veículos → Fonte de dados → Feed programado, colando o link do CSV.</span>
        </div>
      </section>

      <section className={secao}>
        <h2 className="text-sm font-semibold">Quilometragem</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.exigirKm} onChange={(e) => setF({ ...f, exigirKm: e.target.checked })} />
          Exigir a quilometragem para colocar o carro à venda
        </label>
        <p className="text-xs text-neutral-500">
          Desligado, o carro vai à venda sem a km e ela aparece como “não informada” (no site, nos feeds, no WhatsApp e no Vendedor IA), nunca como “0 km”. Alguns portais exigem a km
          para publicar; nesses, o carro sem km fica de fora do anúncio.
        </p>
      </section>

      <section className={secao}>
        <h2 className="text-sm font-semibold">Política de privacidade</h2>
        <p className="text-xs text-neutral-500">
          A vitrine publica uma política de privacidade padrão (LGPD) em <code>/privacidade</code>, que cita a loja, o que os formulários coletam e, se você ligou o pixel ou o Analytics,
          o rastreamento. É um modelo: se a loja tem um texto do advogado, cole aqui e ele substitui o padrão.
        </p>
        <textarea id="vitrine-politica" rows={5} value={f.politicaPrivacidade} onChange={(e) => setF({ ...f, politicaPrivacidade: e.target.value })} placeholder="Vazio = política padrão do Zap" aria-label="Texto próprio da política de privacidade" className={campo} />
      </section>

      {aviso && <p className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}
      <div>
        <button disabled={salvando} className={botaoPrimario}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
