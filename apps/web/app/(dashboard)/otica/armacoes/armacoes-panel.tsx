"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { reaisParaCentavos } from "../../funil/tipos";
import { erroDaResposta, fetcher } from "../formatos";

type Armacao = {
  id: string;
  codigo: string;
  descricao: string;
  marca: string | null;
  cor: string | null;
  material: string | null;
  medidas: string | null;
  custoCents: number | null;
  precoCents: number | null;
  quantidade: number;
  ativo: boolean;
};
type Lista = { itens: Armacao[]; resumo: { cadastradas: number; modelosDisponiveis: number; pecasDisponiveis: number } };
type Previa = { lidas: number; criadas: number; puladas: string[]; erros: { linha: number; erro: string }[]; simulado: boolean };

const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
const rotulo = "text-xs font-medium text-neutral-700";

/**
 * O estoque de armações: a maior parte é peça única com etiqueta, então a
 * lista é por CÓDIGO. Vender a última peça a tira da escolha na OS; a lista
 * toda entra de uma vez colando a planilha.
 */
export function ArmacoesPanel() {
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [soDisp, setSoDisp] = useState(false);
  const { data, mutate, isLoading } = useSWR<Lista>(`/api/otica/armacoes?limite=200${soDisp ? "&disponiveis=1" : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`, fetcher);
  const { data: opcoes } = useSWR<{ gestao: boolean }>("/api/otica/opcoes", fetcher);
  const [novaAberta, setNovaAberta] = useState(false);
  const [importAberto, setImportAberto] = useState(false);

  // Espera parar de digitar: 250 armações filtradas por tecla seria consulta à toa.
  useEffect(() => {
    const t = setTimeout(() => setQ(busca.trim()), 250);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{data?.resumo.cadastradas ?? 0} cadastradas</span>
        <span className="rounded-full bg-accent/10 px-3 py-1 text-accent">{data?.resumo.pecasDisponiveis ?? 0} peça(s) à venda em {data?.resumo.modelosDisponiveis ?? 0} modelo(s)</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input id="busca-armacao" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, modelo, marca ou cor" className={`${campo} max-w-sm`} />
        <label className="flex items-center gap-1.5 text-xs text-neutral-600">
          <input type="checkbox" checked={soDisp} onChange={(e) => setSoDisp(e.target.checked)} className="accent-[rgb(var(--accent))]" />
          Só as que estão à venda
        </label>
        <button onClick={() => setNovaAberta((v) => !v)} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Nova armação</button>
        {opcoes?.gestao && (
          <button onClick={() => setImportAberto((v) => !v)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:border-accent">Importar da planilha</button>
        )}
      </div>

      {novaAberta && <NovaArmacao aoCriar={() => { mutate(); setNovaAberta(false); }} />}
      {importAberto && <Importar aoImportar={() => mutate()} />}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Modelo</th>
              <th className="px-3 py-2 text-right font-medium">Preço</th>
              <th className="px-3 py-2 text-center font-medium">Qtd</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.itens.map((a) => <Linha key={a.id} a={a} aoMudar={() => mutate()} />)}
            {!isLoading && data?.itens.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-neutral-500">{q ? "Nenhuma armação encontrada." : "Nenhuma armação cadastrada ainda. Cadastre uma ou importe a planilha."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data && data.resumo.cadastradas > data.itens.length && !q && <p className="text-xs text-neutral-500">Mostrando as primeiras {data.itens.length}. Use a busca para achar as outras.</p>}
    </div>
  );
}

function Linha({ a, aoMudar }: { a: Armacao; aoMudar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const detalhe = [a.marca, a.cor, a.material, a.medidas].filter(Boolean).join(" · ");

  async function patch(corpo: object) {
    setErro(null);
    const r = await fetch(`/api/otica/armacoes/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (!r.ok) return setErro(await erroDaResposta(r));
    aoMudar();
  }

  const situacao = !a.ativo ? ["Desativada", "text-neutral-400"] : a.quantidade > 0 ? ["À venda", "text-accent"] : ["Vendida", "text-neutral-500"];
  return (
    <tr className={`border-t border-neutral-100 ${a.ativo ? "" : "text-neutral-400"}`}>
      <td className="px-3 py-2 font-medium tabular-nums">{a.codigo}</td>
      <td className="px-3 py-2">
        {a.descricao}
        {detalhe && <span className="block text-xs text-neutral-500">{detalhe}</span>}
        {erro && <span className="block text-xs text-red-600">{erro}</span>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{a.precoCents ? centsToBRL(a.precoCents) : "—"}</td>
      <td className="px-3 py-2 text-center">
        <input
          id={`qtd-${a.id}`}
          aria-label={`Quantidade de ${a.codigo}`}
          defaultValue={a.quantidade}
          key={a.quantidade}
          onBlur={(e) => Number(e.target.value) !== a.quantidade && /^\d+$/.test(e.target.value) && patch({ novaQuantidade: Number(e.target.value), motivo: "Ajuste na tela de armações" })}
          inputMode="numeric"
          className="w-14 rounded border border-neutral-300 bg-surface px-2 py-1 text-center text-sm tabular-nums"
        />
      </td>
      <td className={`px-3 py-2 text-xs font-medium ${situacao[1]}`}>{situacao[0]}</td>
      <td className="px-3 py-2 text-right">
        <button onClick={() => patch({ ativo: !a.ativo })} className="text-xs text-neutral-500 hover:text-accent">{a.ativo ? "Desativar" : "Reativar"}</button>
      </td>
    </tr>
  );
}

function NovaArmacao({ aoCriar }: { aoCriar: () => void }) {
  const [f, setF] = useState({ codigo: "", descricao: "", marca: "", cor: "", material: "", medidas: "", custo: "", preco: "", quantidade: "1" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const custo = f.custo.trim() ? reaisParaCentavos(f.custo) : null;
    const preco = f.preco.trim() ? reaisParaCentavos(f.preco) : null;
    if (custo === null && f.custo.trim()) return setErro("Confira o custo.");
    if (preco === null && f.preco.trim()) return setErro("Confira o preço.");
    setSalvando(true);
    const r = await fetch("/api/otica/armacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: f.codigo, descricao: f.descricao, marca: f.marca, cor: f.cor, material: f.material, medidas: f.medidas, custoCents: custo, precoCents: preco, quantidade: Number(f.quantidade || 1) }),
    });
    setSalvando(false);
    if (!r.ok) return setErro(await erroDaResposta(r));
    aoCriar();
  }

  return (
    <form onSubmit={salvar} className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-lg border border-neutral-200 bg-surface p-4">
      <label className={rotulo}>Código da etiqueta<input id="arm-codigo" value={f.codigo} onChange={mudar("codigo")} className={`${campo} mt-1`} required /></label>
      <label className={`${rotulo} col-span-2`}>Modelo<input id="arm-desc" value={f.descricao} onChange={mudar("descricao")} placeholder="ex.: Acetato preta redonda" className={`${campo} mt-1`} required /></label>
      <label className={rotulo}>Marca<input id="arm-marca" value={f.marca} onChange={mudar("marca")} className={`${campo} mt-1`} /></label>
      <label className={rotulo}>Cor<input id="arm-cor" value={f.cor} onChange={mudar("cor")} className={`${campo} mt-1`} /></label>
      <label className={rotulo}>Material<input id="arm-material" value={f.material} onChange={mudar("material")} placeholder="Acetato, Metal..." className={`${campo} mt-1`} /></label>
      <label className={rotulo}>Medidas<input id="arm-medidas" value={f.medidas} onChange={mudar("medidas")} placeholder="52□19-145" className={`${campo} mt-1`} /></label>
      <label className={rotulo}>Quantidade<input id="arm-qtd" value={f.quantidade} onChange={mudar("quantidade")} inputMode="numeric" className={`${campo} mt-1`} /></label>
      <label className={rotulo}>Custo (R$)<input id="arm-custo" value={f.custo} onChange={mudar("custo")} inputMode="decimal" className={`${campo} mt-1`} /></label>
      <label className={rotulo}>Preço (R$)<input id="arm-preco" value={f.preco} onChange={mudar("preco")} inputMode="decimal" className={`${campo} mt-1`} /></label>
      <div className="col-span-2 flex items-end gap-2">
        <button disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{salvando ? "Salvando…" : "Cadastrar"}</button>
        {erro && <span role="alert" className="text-xs text-red-600">{erro}</span>}
      </div>
    </form>
  );
}

function Importar({ aoImportar }: { aoImportar: () => void }) {
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);

  async function enviar(simular: boolean) {
    setErro(null);
    setFeito(null);
    setEnviando(true);
    const r = await fetch("/api/otica/armacoes/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto, simular }) });
    setEnviando(false);
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      setPrevia(null);
      return setErro(typeof j?.error === "string" ? j.error : "não deu para ler a lista");
    }
    if (simular) return setPrevia(j);
    setFeito(`${j.criadas} armação(ões) importada(s)${j.puladas.length ? `, ${j.puladas.length} já existiam e foram mantidas` : ""}.`);
    setPrevia(null);
    setTexto("");
    aoImportar();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold">Importar da planilha</h2>
        <p className="text-xs text-neutral-500">
          No Excel, selecione as linhas e copie; cole aqui. A primeira linha pode ser o cabeçalho (Código, Modelo, Marca, Cor, Material, Medidas, Custo, Preço, Qtd), em qualquer ordem.
          Sem cabeçalho, vale essa ordem. Quantidade vazia vale 1. Código que já existe é mantido, nunca sobrescrito.
        </p>
      </div>
      <textarea id="importar-texto" value={texto} onChange={(e) => { setTexto(e.target.value); setPrevia(null); }} rows={8} placeholder={"Código\tModelo\tCor\tPreço\nA001\tAcetato redonda\tPreta\t290,00"} className={`${campo} font-mono text-xs`} />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => enviar(true)} disabled={enviando || !texto.trim()} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:border-accent disabled:opacity-50">Conferir a lista</button>
        {previa && previa.criadas > 0 && (
          <button onClick={() => enviar(false)} disabled={enviando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">Importar {previa.criadas} armação(ões)</button>
        )}
      </div>
      {erro && <p role="alert" className="text-xs text-red-600">{erro}</p>}
      {feito && <p role="status" className="text-sm text-accent">{feito}</p>}
      {previa && (
        <div className="flex flex-col gap-1 text-xs" role="status">
          <p><b>{previa.criadas}</b> nova(s) · <b>{previa.puladas.length}</b> já existe(m) · <b className={previa.erros.length ? "text-red-600" : ""}>{previa.erros.length}</b> com problema</p>
          {previa.erros.slice(0, 12).map((e) => <p key={`${e.linha}-${e.erro}`} className="text-red-600">Linha {e.linha}: {e.erro}</p>)}
          {previa.erros.length > 12 && <p className="text-neutral-500">…e mais {previa.erros.length - 12}. As linhas com problema ficam de fora; corrija e importe de novo só elas.</p>}
        </div>
      )}
    </div>
  );
}
