"use client";

import { useState } from "react";
import useSWR from "swr";
import { CampoDinheiro, brl, campo, fetcher, rotulo } from "./comum";

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
  opcionais: string;
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
  opcionais: "",
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
    opcionais: Array.isArray(v.opcionais) ? (v.opcionais as string[]).join(", ") : "",
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
  const km = inteiro(f.km);
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
    opcionais: f.opcionais
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
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
}: {
  f: FormVeiculo;
  set: (patch: Partial<FormVeiculo>) => void;
  gerencia: boolean;
  comPreco?: boolean;
  prefixo?: string;
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
        {texto("km", "Quilometragem", { inputMode: "numeric" })}
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
        {texto("renavam", "Renavam", { inputMode: "numeric" })}
        <div className="sm:col-span-3">{texto("chassi", "Chassi")}</div>
        <div className="sm:col-span-3">{texto("opcionais", "Opcionais (separados por vírgula)", { placeholder: "Ar-condicionado, Direção elétrica, Multimídia" })}</div>
      </div>
      {comPreco && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Preço de venda (anúncio)</span>
            <CampoDinheiro id={`${prefixo}-preco`} valor={f.precoCents} onChange={(c) => set({ precoCents: c })} />
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
          <span className={rotulo}>Texto do anúncio</span>
          <textarea id={`${prefixo}-descricao`} rows={3} value={f.descricao} onChange={(e) => set({ descricao: e.target.value })} className={campo} placeholder="Único dono, revisões na concessionária, manual e chave reserva." />
        </label>
      )}
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
