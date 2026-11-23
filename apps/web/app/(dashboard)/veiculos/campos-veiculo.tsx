"use client";

import { useState } from "react";
import useSWR from "swr";
import { CampoDinheiro, brl, campo, fetcher, rotulo } from "./comum";
import { CARACTERISTICAS, CARROCERIAS, OPCIONAIS, idDoYoutube, qualidadeDoAnuncio } from "@/lib/veiculos-cadastro";

type Portal = "OLX" | "WEBMOTORS" | "MOBIAUTO" | "NAPISTA";
const NOME_PORTAL: Record<Portal, string> = { OLX: "OLX", WEBMOTORS: "Webmotors", MOBIAUTO: "MobiAuto", NAPISTA: "NaPista" };
type Ajuste = { precoCents: number | null; descricao: string };

/** Os dados do carro como a tela edita: textos e números soltos, convertidos na hora de salvar. */
export type FormVeiculo = {
  tipo: "CARRO" | "MOTO" | "CAMINHAO";
  placa: string;
  chassi: string;
  renavam: string;
  marca: string;
  modelo: string;
  versao: string;
  anoFabricacao: string;
  anoModelo: string;
  km: string;
  cor: string;
  combustivel: string;
  cambio: string;
  portas: string;
  opcionais: string[];
  caracteristicas: string[];
  carroceria: string;
  zeroKm: boolean;
  ocultarKm: boolean;
  /** "Sob consulta": o site não mostra o preço deste carro (os portais seguem com o valor). */
  ocultarPreco: boolean;
  videoUrl: string;
  precoClassificadosCents: number | null;
  /** Desligado = os classificados usam outro texto (descricaoClassificados). */
  mesmaObservacao: boolean;
  descricaoClassificados: string;
  ajustesPorPortal: Partial<Record<Portal, Ajuste>>;
  codigoFipe: string;
  fipeCents: number | null;
  fipeReferencia: string;
  precoCents: number | null;
  precoMinimoCents: number | null;
  descricao: string;
  observacoesInternas: string;
  naVitrine: boolean;
};

export const FORM_VAZIO: FormVeiculo = {
  tipo: "CARRO",
  placa: "",
  chassi: "",
  renavam: "",
  marca: "",
  modelo: "",
  versao: "",
  anoFabricacao: "",
  anoModelo: "",
  km: "",
  cor: "",
  combustivel: "Flex",
  cambio: "Manual",
  portas: "4",
  opcionais: [],
  caracteristicas: [],
  carroceria: "",
  zeroKm: false,
  ocultarKm: false,
  ocultarPreco: false,
  videoUrl: "",
  precoClassificadosCents: null,
  mesmaObservacao: true,
  descricaoClassificados: "",
  ajustesPorPortal: {},
  codigoFipe: "",
  fipeCents: null,
  fipeReferencia: "",
  precoCents: null,
  precoMinimoCents: null,
  descricao: "",
  observacoesInternas: "",
  naVitrine: true,
};

/** Do banco para a tela. */
export function paraForm(v: Record<string, unknown>): FormVeiculo {
  const t = (k: string) => (v[k] == null ? "" : String(v[k]));
  return {
    tipo: (v.tipo as FormVeiculo["tipo"]) ?? "CARRO",
    placa: t("placa"),
    chassi: t("chassi"),
    renavam: t("renavam"),
    marca: t("marca"),
    modelo: t("modelo"),
    versao: t("versao"),
    anoFabricacao: t("anoFabricacao"),
    anoModelo: t("anoModelo"),
    km: t("km"),
    cor: t("cor"),
    combustivel: t("combustivel"),
    cambio: t("cambio"),
    portas: t("portas"),
    opcionais: Array.isArray(v.opcionais) ? (v.opcionais as string[]) : [],
    caracteristicas: Array.isArray(v.caracteristicas) ? (v.caracteristicas as string[]) : [],
    carroceria: t("carroceria"),
    zeroKm: v.zeroKm === true,
    ocultarKm: v.ocultarKm === true,
    ocultarPreco: v.ocultarPreco === true,
    videoUrl: t("videoUrl"),
    precoClassificadosCents: (v.precoClassificadosCents as number | null) ?? null,
    mesmaObservacao: !v.descricaoClassificados,
    descricaoClassificados: t("descricaoClassificados"),
    ajustesPorPortal: Object.fromEntries(
      Object.entries((v.ajustesPorPortal as Record<string, { precoCents?: number; descricao?: string }> | null) ?? {}).map(([k, a]) => [k, { precoCents: a.precoCents ?? null, descricao: a.descricao ?? "" }]),
    ) as FormVeiculo["ajustesPorPortal"],
    codigoFipe: t("codigoFipe"),
    fipeCents: (v.fipeCents as number | null) ?? null,
    fipeReferencia: t("fipeReferencia"),
    precoCents: (v.precoCents as number | null) ?? null,
    precoMinimoCents: (v.precoMinimoCents as number | null) ?? null,
    descricao: t("descricao"),
    observacoesInternas: t("observacoesInternas"),
    naVitrine: v.naVitrine !== false,
  };
}

/** Da tela para a rota. Lança erro com a mensagem do campo que falta. */
export function paraRota(f: FormVeiculo, opts: { exigirPreco: boolean; gerencia: boolean }) {
  const inteiro = (s: string) => (s.trim() ? Number(s.replace(/\D/g, "")) : null);
  const anoFab = inteiro(f.anoFabricacao);
  const anoMod = inteiro(f.anoModelo);
  const km = f.zeroKm ? 0 : inteiro(f.km);
  if (!f.marca.trim() || !f.modelo.trim()) throw new Error("informe marca e modelo");
  if (!anoFab || !anoMod) throw new Error("informe os anos de fabricação e modelo");
  if (km === null) throw new Error("informe a quilometragem");
  if (opts.exigirPreco && !f.precoCents) throw new Error("informe o preço de venda");
  return {
    tipo: f.tipo,
    placa: f.placa.trim() || null,
    chassi: f.chassi.trim() || null,
    renavam: f.renavam.trim() || null,
    marca: f.marca.trim(),
    modelo: f.modelo.trim(),
    versao: f.versao.trim() || null,
    anoFabricacao: anoFab,
    anoModelo: anoMod,
    km,
    cor: f.cor.trim() || null,
    combustivel: f.combustivel.trim() || null,
    cambio: f.cambio.trim() || null,
    portas: inteiro(f.portas),
    opcionais: f.opcionais.map((s) => s.trim()).filter(Boolean),
    caracteristicas: f.caracteristicas,
    carroceria: f.carroceria || null,
    zeroKm: f.zeroKm,
    ocultarKm: f.ocultarKm,
    ocultarPreco: f.ocultarPreco,
    videoUrl: f.videoUrl.trim() || null,
    precoClassificadosCents: f.precoClassificadosCents && f.precoClassificadosCents !== f.precoCents ? f.precoClassificadosCents : null,
    descricaoClassificados: f.mesmaObservacao ? null : f.descricaoClassificados.trim() || null,
    ajustesPorPortal: Object.fromEntries(Object.entries(f.ajustesPorPortal).map(([k, a]) => [k, { precoCents: a?.precoCents ?? null, descricao: a?.descricao?.trim() || null }])),
    codigoFipe: f.codigoFipe || null,
    fipeCents: f.fipeCents,
    fipeReferencia: f.fipeReferencia || null,
    precoCents: f.precoCents ?? 0,
    descricao: f.descricao.trim() || null,
    ...(opts.gerencia ? { precoMinimoCents: f.precoMinimoCents, observacoesInternas: f.observacoesInternas.trim() || null, naVitrine: f.naVitrine } : {}),
  };
}

type ItemFipe = { code: string; name: string };
type PrecoFipe = { codigoFipe: string; marca: string; modelo: string; anoModelo: number; combustivel: string; precoCents: number; referencia: string };

/**
 * Preenche pela FIPE: marca → modelo → ano. Escolher o ano traz o código, o
 * valor da tabela e o combustível. É ajuda: se a FIPE não responder, tudo se
 * digita à mão.
 */
function BuscaFipe({ tipo, onPreco }: { tipo: FormVeiculo["tipo"]; onPreco: (p: PrecoFipe, marca: string, modelo: string) => void }) {
  const [marca, setMarca] = useState<ItemFipe | null>(null);
  const [modelo, setModelo] = useState<ItemFipe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const base = `/api/veiculos/fipe?tipo=${tipo}`;
  const { data: marcas, error: erroMarcas } = useSWR<ItemFipe[]>(base, fetcher, { revalidateOnFocus: false });
  const { data: modelos } = useSWR<ItemFipe[]>(marca ? `${base}&marca=${marca.code}` : null, fetcher, { revalidateOnFocus: false });
  const { data: anos } = useSWR<ItemFipe[]>(marca && modelo ? `${base}&marca=${marca.code}&modelo=${modelo.code}` : null, fetcher, { revalidateOnFocus: false });

  async function escolherAno(code: string) {
    if (!marca || !modelo || !code) return;
    setCarregando(true);
    setErro(null);
    const r = await fetch(`${base}&marca=${marca.code}&modelo=${modelo.code}&ano=${encodeURIComponent(code)}`);
    setCarregando(false);
    if (!r.ok) {
      setErro((await r.json().catch(() => null))?.error ?? "FIPE indisponível");
      return;
    }
    onPreco(await r.json(), marca.name, modelo.name);
  }

  if (erroMarcas) return <p className="text-xs text-amber-700">FIPE indisponível agora ({(erroMarcas as Error).message}). Preencha à mão.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <select
        aria-label="Marca na FIPE"
        className={campo}
        value={marca?.code ?? ""}
        onChange={(e) => {
          setMarca(marcas?.find((m) => m.code === e.target.value) ?? null);
          setModelo(null);
        }}
      >
        <option value="">{marcas ? "Marca (FIPE)" : "Carregando marcas…"}</option>
        {marcas?.map((m) => (
          <option key={m.code} value={m.code}>
            {m.name}
          </option>
        ))}
      </select>
      <select aria-label="Modelo na FIPE" className={campo} disabled={!marca} value={modelo?.code ?? ""} onChange={(e) => setModelo(modelos?.find((m) => m.code === e.target.value) ?? null)}>
        <option value="">{marca && !modelos ? "Carregando…" : "Modelo (FIPE)"}</option>
        {modelos?.map((m) => (
          <option key={m.code} value={m.code}>
            {m.name}
          </option>
        ))}
      </select>
      <select aria-label="Ano na FIPE" className={campo} disabled={!modelo || carregando} defaultValue="" onChange={(e) => escolherAno(e.target.value)}>
        <option value="">{carregando ? "Consultando…" : "Ano (FIPE)"}</option>
        {anos?.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name}
          </option>
        ))}
      </select>
      {erro && <p className="text-xs text-amber-700 sm:col-span-3">{erro}</p>}
    </div>
  );
}

/** Os campos do carro. Usado na entrada, na ficha e no carro dado na troca. */
export function CamposVeiculo({
  f,
  set,
  gerencia,
  comPreco = true,
  prefixo = "v",
  fotos,
}: {
  f: FormVeiculo;
  set: (patch: Partial<FormVeiculo>) => void;
  gerencia: boolean;
  comPreco?: boolean;
  prefixo?: string;
  /** Quantas fotos o carro tem (para a qualidade do anúncio); sem isso, a nota não aparece. */
  fotos?: number;
}) {
  const [fipeAberta, setFipeAberta] = useState(false);
  const [placaBusca, setPlacaBusca] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [buscandoPlaca, setBuscandoPlaca] = useState(false);
  /** Preenche a ficha com o que o provedor sabe da placa (só o que ele trouxe; km, preço e opcionais ficam como estão). */
  async function buscarPelaPlaca() {
    setPlacaBusca(null);
    setBuscandoPlaca(true);
    try {
      const r = await fetch(`/api/veiculos/placa?placa=${encodeURIComponent(f.placa)}`);
      const j = await r.json().catch(() => null);
      if (!r.ok) return setPlacaBusca({ texto: j?.error ?? "Não foi possível consultar a placa.", erro: true });
      const d = j.dados as { marca?: string; modelo?: string; versao?: string; anoFabricacao?: number; anoModelo?: number; cor?: string; combustivel?: string; cambio?: string; portas?: number; chassi?: string; renavam?: string; codigoFipe?: string };
      set({
        ...(d.marca ? { marca: d.marca } : {}),
        ...(d.modelo ? { modelo: d.modelo } : {}),
        ...(d.versao ? { versao: d.versao } : {}),
        ...(d.anoFabricacao ? { anoFabricacao: String(d.anoFabricacao) } : {}),
        ...(d.anoModelo ? { anoModelo: String(d.anoModelo), ...(!d.anoFabricacao && !f.anoFabricacao ? { anoFabricacao: String(d.anoModelo) } : {}) } : {}),
        ...(d.cor ? { cor: d.cor } : {}),
        ...(d.combustivel ? { combustivel: d.combustivel } : {}),
        ...(d.cambio ? { cambio: d.cambio } : {}),
        ...(d.portas ? { portas: String(d.portas) } : {}),
        ...(d.chassi ? { chassi: d.chassi } : {}),
        ...(d.renavam ? { renavam: d.renavam } : {}),
        ...(d.codigoFipe ? { codigoFipe: d.codigoFipe } : {}),
      });
      setPlacaBusca({ texto: "Dados da placa preenchidos. Confira a versão e preencha o que faltar (km, cor, câmbio…)." });
    } finally {
      setBuscandoPlaca(false);
    }
  }
  const texto = (k: keyof FormVeiculo, r: string, extra?: { placeholder?: string; inputMode?: "numeric" | "text" }) => (
    <label className="flex flex-col gap-1">
      <span className={rotulo}>{r}</span>
      <input id={`${prefixo}-${k}`} value={f[k] as string} onChange={(e) => set({ [k]: e.target.value })} className={campo} {...extra} />
    </label>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Tipo de veículo" value={f.tipo} onChange={(e) => set({ tipo: e.target.value as FormVeiculo["tipo"] })} className={`${campo} w-auto`}>
          <option value="CARRO">Carro</option>
          <option value="MOTO">Moto</option>
          <option value="CAMINHAO">Caminhão</option>
        </select>
        <button type="button" onClick={() => setFipeAberta((x) => !x)} className="text-xs text-accent hover:underline">
          {fipeAberta ? "fechar FIPE" : "Preencher pela tabela FIPE"}
        </button>
        {f.fipeCents ? (
          <span className="text-xs text-neutral-500">
            FIPE {brl(f.fipeCents)}
            {f.fipeReferencia ? ` (${f.fipeReferencia})` : ""}
            {f.codigoFipe ? ` · cód. ${f.codigoFipe}` : ""}
          </span>
        ) : null}
      </div>
      {fipeAberta && (
        <BuscaFipe
          tipo={f.tipo}
          onPreco={(p, marca, modelo) => {
            // O nome do modelo na FIPE junta modelo e versão ("Onix LT 1.0 Flex"):
            // a primeira palavra vira o modelo e o resto a versão, para a pessoa ajustar.
            const [primeira, ...resto] = modelo.split(" ");
            set({
              marca: f.marca || marca,
              modelo: f.modelo || primeira,
              versao: f.versao || resto.join(" "),
              anoModelo: p.anoModelo < 3000 ? String(p.anoModelo) : f.anoModelo,
              anoFabricacao: f.anoFabricacao || (p.anoModelo < 3000 ? String(p.anoModelo) : ""),
              combustivel: p.combustivel || f.combustivel,
              codigoFipe: p.codigoFipe,
              fipeCents: p.precoCents,
              fipeReferencia: p.referencia,
            });
            setFipeAberta(false);
          }}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {texto("marca", "Marca")}
        {texto("modelo", "Modelo")}
        {texto("versao", "Versão", { placeholder: "LT 1.0 Turbo" })}
        {texto("anoFabricacao", "Ano fabricação", { inputMode: "numeric" })}
        {texto("anoModelo", "Ano modelo", { inputMode: "numeric" })}
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Quilometragem</span>
            <input id={`${prefixo}-km`} value={f.zeroKm ? "0" : f.km} disabled={f.zeroKm} onChange={(e) => set({ km: e.target.value })} inputMode="numeric" className={campo} />
          </label>
          {comPreco && (
            <div className="flex flex-wrap gap-x-3 text-xs text-neutral-600">
              <label className="flex items-center gap-1"><input type="checkbox" checked={f.zeroKm} onChange={(e) => set({ zeroKm: e.target.checked, ...(e.target.checked ? { km: "0" } : {}) })} /> Veículo 0 km</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={f.ocultarKm} onChange={(e) => set({ ocultarKm: e.target.checked })} /> Km n/a no site</label>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 sm:col-span-3">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Placa</span>
            <div className="flex gap-2">
              <input id={`${prefixo}-placa`} value={f.placa} onChange={(e) => set({ placa: e.target.value.toUpperCase() })} placeholder="ABC1D23" className={`${campo} max-w-[200px]`} />
              {gerencia && (
                <button type="button" onClick={buscarPelaPlaca} disabled={buscandoPlaca || f.placa.replace(/[^A-Za-z0-9]/g, "").length < 7} className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:border-accent disabled:opacity-50">
                  {buscandoPlaca ? "Buscando…" : "Buscar pela placa"}
                </button>
              )}
            </div>
          </label>
          {placaBusca && <p className={`text-xs ${placaBusca.erro ? "text-amber-700" : "text-emerald-700"}`} role="status">{placaBusca.texto}</p>}
        </div>
        {texto("cor", "Cor")}
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Câmbio</span>
          <select id={`${prefixo}-cambio`} value={f.cambio} onChange={(e) => set({ cambio: e.target.value })} className={campo}>
            {["", "Manual", "Automático", "CVT", "Automatizado"].map((c) => (
              <option key={c} value={c}>
                {c || "—"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Combustível</span>
          <select id={`${prefixo}-combustivel`} value={f.combustivel} onChange={(e) => set({ combustivel: e.target.value })} className={campo}>
            {[...new Set(["", "Flex", "Gasolina", "Etanol", "Diesel", "Híbrido", "Elétrico", "GNV", f.combustivel])].map((c) => (
              <option key={c} value={c}>
                {c || "—"}
              </option>
            ))}
          </select>
        </label>
        {texto("portas", "Portas", { inputMode: "numeric" })}
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Carroceria</span>
          <select id={`${prefixo}-carroceria`} value={f.carroceria} onChange={(e) => set({ carroceria: e.target.value })} className={campo}>
            {[...new Set(["", ...CARROCERIAS, f.carroceria])].map((c) => (
              <option key={c} value={c}>{c || "—"}</option>
            ))}
          </select>
        </label>
        {texto("renavam", "Renavam", { inputMode: "numeric" })}
        <div className="sm:col-span-3">{texto("chassi", "Chassi")}</div>
        {comPreco && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={rotulo}>Vídeo (opcional)</span>
            <input id={`${prefixo}-video`} value={f.videoUrl} onChange={(e) => set({ videoUrl: e.target.value })} placeholder="Link do YouTube" className={campo} />
            {f.videoUrl.trim() && !idDoYoutube(f.videoUrl) && <span className="text-xs text-amber-700">Use um link do YouTube (youtube.com ou youtu.be).</span>}
          </label>
        )}
      </div>
      {comPreco && <Caracteristicas valor={f.caracteristicas} onChange={(caracteristicas) => set({ caracteristicas })} />}
      {comPreco && <ListaDeOpcionais valor={f.opcionais} onChange={(opcionais) => set({ opcionais })} />}
      {comPreco && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Preço no site</span>
            <CampoDinheiro id={`${prefixo}-preco`} valor={f.precoCents} onChange={(c) => set({ precoCents: c })} />
            <label className="flex items-start gap-1.5 text-xs text-neutral-600">
              <input type="checkbox" className="mt-0.5" checked={f.ocultarPreco} onChange={(e) => set({ ocultarPreco: e.target.checked })} />
              <span>Sob consulta no site (não mostrar o valor). Os portais continuam recebendo este preço.</span>
            </label>
          </label>
          <label className="flex flex-col gap-1">
            <span className={`${rotulo} flex items-center justify-between gap-2`}>
              Preço nos classificados
              <button type="button" className="text-xs font-normal text-accent hover:underline" onClick={() => set({ precoClassificadosCents: f.precoCents })}>Copiar do site</button>
            </span>
            <CampoDinheiro id={`${prefixo}-preco-classificados`} valor={f.precoClassificadosCents} onChange={(c) => set({ precoClassificadosCents: c })} />
            <span className="text-xs text-neutral-500">Vazio = o mesmo do site. Vale para OLX, Webmotors, MobiAuto e NaPista.</span>
          </label>
          {gerencia && (
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Menor preço aceito (só a gestão vê)</span>
              <CampoDinheiro id={`${prefixo}-piso`} valor={f.precoMinimoCents} onChange={(c) => set({ precoMinimoCents: c })} />
            </label>
          )}
        </div>
      )}
      {comPreco && (
        <label className="flex flex-col gap-1">
          <span className={`${rotulo} flex items-center justify-between gap-2`}>
            Observação no site
            <a href="/veiculos/configuracoes#observacao-padrao" className="text-xs font-normal text-accent hover:underline">Definir observação padrão</a>
          </span>
          <textarea id={`${prefixo}-descricao`} rows={5} value={f.descricao} onChange={(e) => set({ descricao: e.target.value })} className={campo} placeholder="Único dono, revisões na concessionária, manual e chave reserva." />
          <span className="self-end text-xs text-neutral-400">{f.descricao.length} caracteres</span>
        </label>
      )}
      {comPreco && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.mesmaObservacao} onChange={(e) => set({ mesmaObservacao: e.target.checked, ...(!e.target.checked && !f.descricaoClassificados ? { descricaoClassificados: f.descricao } : {}) })} />
            Usar a mesma observação nos classificados
          </label>
          {!f.mesmaObservacao && (
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Observação nos classificados</span>
              <textarea id={`${prefixo}-descricao-classificados`} rows={4} value={f.descricaoClassificados} onChange={(e) => set({ descricaoClassificados: e.target.value })} className={campo} />
            </label>
          )}
        </div>
      )}
      {comPreco && gerencia && <DiferenteEmPortal valor={f.ajustesPorPortal} onChange={(ajustesPorPortal) => set({ ajustesPorPortal })} />}
      {comPreco && fotos !== undefined && <QualidadeDoAnuncio f={f} fotos={fotos} />}
      {comPreco && gerencia && (
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Observações internas (só a gestão vê)</span>
          <textarea id={`${prefixo}-obs`} rows={2} value={f.observacoesInternas} onChange={(e) => set({ observacoesInternas: e.target.value })} className={campo} />
        </label>
      )}
      {comPreco && gerencia && (
        <label className="flex items-center gap-2 text-sm">
          <input id={`${prefixo}-vitrine`} type="checkbox" checked={f.naVitrine} onChange={(e) => set({ naVitrine: e.target.checked })} />
          Mostrar na vitrine pública (quando disponível)
        </label>
      )}
    </div>
  );
}

/** Características do carro em etiquetas (IPVA pago, único dono…), como no AutoCerto. */
function Caracteristicas({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  const alternar = (c: string) => onChange(valor.includes(c) ? valor.filter((x) => x !== c) : [...valor, c]);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`${rotulo} mb-1 flex w-full items-center justify-between`}>
        Características
        <button type="button" className="text-xs font-normal text-accent hover:underline" onClick={() => onChange(valor.length === CARACTERISTICAS.length ? [] : [...CARACTERISTICAS])}>
          {valor.length === CARACTERISTICAS.length ? "Desmarcar todas" : "Marcar todas"}
        </button>
      </legend>
      <div className="flex flex-wrap gap-2">
        {CARACTERISTICAS.map((c) => (
          <label key={c} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${valor.includes(c) ? "border-accent bg-accent/10 text-accent" : "border-neutral-300 text-neutral-700"}`}>
            <input type="checkbox" className="h-3.5 w-3.5" checked={valor.includes(c)} onChange={() => alternar(c)} />
            {c}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Opcionais em caixas de marcar, com busca, "Marcados" e "Marcar todos"; o que não está na lista entra em "Outros". */
function ListaDeOpcionais({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  const [busca, setBusca] = useState("");
  const [soMarcados, setSoMarcados] = useState(false);
  const [outro, setOutro] = useState("");
  const daLista = new Set<string>(OPCIONAIS);
  const extras = valor.filter((o) => !daLista.has(o));
  const termo = semAcento(busca.trim());
  const visiveis = [...OPCIONAIS, ...extras].filter((o) => (!soMarcados || valor.includes(o)) && (!termo || semAcento(o).includes(termo)));
  const alternar = (o: string) => onChange(valor.includes(o) ? valor.filter((x) => x !== o) : [...valor, o]);
  const adicionarOutro = () => {
    const t = outro.trim();
    if (t && !valor.includes(t)) onChange([...valor, t]);
    setOutro("");
  };
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      <legend className={`${rotulo} px-1`}>Opcionais</legend>
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Buscar opcional" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar opcional" className={`${campo} max-w-[220px]`} />
        <div className="flex overflow-hidden rounded-md border border-neutral-300 text-xs">
          <button type="button" onClick={() => setSoMarcados(false)} className={`px-3 py-1.5 ${!soMarcados ? "bg-neutral-100 font-semibold" : ""}`}>Todos</button>
          <button type="button" onClick={() => setSoMarcados(true)} className={`px-3 py-1.5 ${soMarcados ? "bg-neutral-100 font-semibold" : ""}`}>Marcados ({valor.length})</button>
        </div>
        <button type="button" className="ml-auto text-xs text-accent hover:underline" onClick={() => onChange(valor.length >= OPCIONAIS.length ? extras : [...new Set([...valor, ...OPCIONAIS])])}>
          {valor.length >= OPCIONAIS.length ? "Desmarcar todos" : "Marcar todos"}
        </button>
      </div>
      <div className="grid max-h-80 gap-x-4 gap-y-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
        {visiveis.map((o) => (
          <label key={o} className="flex items-start gap-2 py-0.5 text-sm">
            <input type="checkbox" className="mt-0.5" checked={valor.includes(o)} onChange={() => alternar(o)} />
            <span>{o}</span>
          </label>
        ))}
        {visiveis.length === 0 && <p className="text-sm text-neutral-500">Nenhum opcional {soMarcados ? "marcado" : "com esse nome"}.</p>}
      </div>
      <div className="flex gap-2">
        <input aria-label="Outro opcional" value={outro} onChange={(e) => setOutro(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarOutro(); } }} placeholder="Outro opcional que não está na lista" className={`${campo} max-w-sm`} />
        <button type="button" onClick={adicionarOutro} className="rounded-md border border-neutral-300 px-3 text-sm hover:border-accent">Adicionar</button>
      </div>
    </fieldset>
  );
}

/** "Diferente em algum portal": preço e/ou observação próprios de um portal. */
function DiferenteEmPortal({ valor, onChange }: { valor: Partial<Record<Portal, Ajuste>>; onChange: (v: Partial<Record<Portal, Ajuste>>) => void }) {
  const usados = Object.keys(valor) as Portal[];
  const livres = (Object.keys(NOME_PORTAL) as Portal[]).filter((p) => !usados.includes(p));
  const mudar = (p: Portal, patch: Partial<Ajuste>) => onChange({ ...valor, [p]: { precoCents: null, descricao: "", ...valor[p], ...patch } });
  const tirar = (p: Portal) => onChange(Object.fromEntries(Object.entries(valor).filter(([k]) => k !== p)) as Partial<Record<Portal, Ajuste>>);
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      <legend className={`${rotulo} px-1`}>Diferente em algum portal</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">Preço ou observação que mudam só em um portal. {usados.length === 0 && "Hoje todos os portais usam o preço e a observação acima."}</p>
        {livres.length > 0 && (
          <select aria-label="Adicionar portal" className={`${campo} w-auto`} value="" onChange={(e) => e.target.value && mudar(e.target.value as Portal, {})}>
            <option value="">+ Adicionar portal</option>
            {livres.map((p) => <option key={p} value={p}>{NOME_PORTAL[p]}</option>)}
          </select>
        )}
      </div>
      {usados.map((p) => (
        <div key={p} className="grid gap-2 rounded-md bg-neutral-50 p-2 sm:grid-cols-[110px_180px_1fr_auto] sm:items-start">
          <span className="pt-2 text-sm font-medium">{NOME_PORTAL[p]}</span>
          <CampoDinheiro id={`ajuste-${p}-preco`} valor={valor[p]?.precoCents ?? null} onChange={(c) => mudar(p, { precoCents: c })} />
          <textarea aria-label={`Observação na ${NOME_PORTAL[p]}`} rows={2} className={campo} placeholder="Vazio = a mesma observação" value={valor[p]?.descricao ?? ""} onChange={(e) => mudar(p, { descricao: e.target.value })} />
          <button type="button" aria-label={`Tirar ${NOME_PORTAL[p]}`} className="pt-2 text-sm text-red-600" onClick={() => tirar(p)}>✕</button>
        </div>
      ))}
    </fieldset>
  );
}

/** A nota do anúncio e o que falta, como a "Qualidade do anúncio" do AutoCerto. */
function QualidadeDoAnuncio({ f, fotos }: { f: FormVeiculo; fotos: number }) {
  const [aberta, setAberta] = useState(false);
  const { nota, falta } = qualidadeDoAnuncio({ fotos, precoCents: f.precoCents, km: f.km, zeroKm: f.zeroKm, versao: f.versao, cor: f.cor, cambio: f.cambio, combustivel: f.combustivel, opcionais: f.opcionais.length, descricao: f.descricao, caracteristicas: f.caracteristicas.length, placa: f.placa });
  const cor = nota >= 80 ? "bg-emerald-500" : nota >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="rounded-lg border border-neutral-200 p-3 text-sm">
      <button type="button" onClick={() => setAberta(!aberta)} className="flex w-full items-center gap-3" aria-expanded={aberta}>
        <span className="h-2 flex-1 rounded-full bg-neutral-100"><span className={`block h-2 rounded-full ${cor}`} style={{ width: `${nota}%` }} /></span>
        <span>Qualidade do anúncio <strong>{nota}%</strong></span>
        <span aria-hidden>{aberta ? "▴" : "▾"}</span>
      </button>
      {aberta && falta.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-neutral-600">
          {falta.map((x) => <li key={x}>Falta: {x}</li>)}
        </ul>
      )}
    </div>
  );
}
