"use client";

import { useRef, useState } from "react";
import { botaoPrimario, botaoSecundario, erroDaResposta, secao } from "../comum";

type Resultado = {
  linhas: number;
  casados: number;
  semCarro: number;
  carrosSemLinha: number;
  ambiguos: number;
  aplicados: number;
  preenche: { placa: number; preco: number; fipe: number; km: number; entrada: number; anoFabricacao: number };
  placasRepetidas: string[];
  linhasComProblema: { numero: number; erro: string }[];
  previa: { nome: string; placa: string | null; precoCents: number; fipeCents: number | null; temKm: boolean }[];
};

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Completa os carros já importados do site com a planilha de estoque do
 * AutoCerto: o site não publica placa nem preço, a planilha tem. Só preenche o
 * que está vazio.
 */
export function CompletarComAutoCerto() {
  const entrada = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [nome, setNome] = useState<string | null>(null);
  const [conferido, setConferido] = useState<Resultado | null>(null);
  const [feito, setFeito] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function ler(f: File | undefined) {
    if (!f) return;
    setErro(null);
    setConferido(null);
    setFeito(null);
    // O AutoCerto exporta em Latin-1: se o UTF-8 der caractere quebrado, relê assim.
    const bytes = await f.arrayBuffer();
    let t = new TextDecoder("utf-8").decode(bytes);
    if (t.includes("�")) t = new TextDecoder("windows-1252").decode(bytes);
    setTexto(t);
    setNome(f.name);
  }

  async function enviar(simular: boolean) {
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/veiculos/importar/autocerto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto, simular }) });
      if (!r.ok) return setErro(await erroDaResposta(r));
      const d = (await r.json()) as Resultado;
      if (simular) setConferido(d);
      else {
        setFeito(d);
        setConferido(null);
      }
    } finally {
      setOcupado(false);
    }
  }

  const r = feito ?? conferido;
  return (
    <section className={secao}>
      <h2 className="text-sm font-semibold">Completar com a planilha do AutoCerto</h2>
      <p className="text-xs text-neutral-500">
        O site da loja não mostra placa nem preço, mas a planilha de estoque do AutoCerto tem. No AutoCerto: Estoque e Integrador → Estoque → exportar. Envie o arquivo como ele vem. O Zap
        casa carro por carro e preenche só o que está vazio, sem mexer no que você já informou.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={entrada} type="file" accept=".xls,.xlsx,.html,.htm,.csv" className="hidden" aria-label="Escolher a planilha do AutoCerto" onChange={(e) => ler(e.target.files?.[0])} />
        <button type="button" className={botaoSecundario} onClick={() => entrada.current?.click()}>
          Escolher a planilha
        </button>
        {nome && <span className="text-sm text-neutral-600">{nome}</span>}
        <button type="button" className={botaoPrimario} disabled={!texto || ocupado} onClick={() => enviar(true)}>
          {ocupado && !r ? "Lendo…" : "Conferir"}
        </button>
      </div>
      {erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{erro}</p>}

      {r && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">
              {r.casados} de {r.linhas} carros casados
            </span>
            {feito ? (
              <span className="rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">{r.aplicados} ficha(s) completada(s)</span>
            ) : (
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{r.aplicados} ficha(s) seriam completadas</span>
            )}
            {r.semCarro > 0 && <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-700">{r.semCarro} linha(s) sem carro no Zap</span>}
            {r.carrosSemLinha > 0 && <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-700">{r.carrosSemLinha} carro(s) do Zap sem linha na planilha</span>}
            {r.ambiguos > 0 && <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-700">{r.ambiguos} repetido(s): não dá para casar</span>}
          </div>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            <li>Placa: <strong>{r.preenche.placa}</strong></li>
            <li>Preço: <strong>{r.preenche.preco}</strong></li>
            <li>FIPE: <strong>{r.preenche.fipe}</strong></li>
            <li>Data de entrada no estoque: <strong>{r.preenche.entrada}</strong></li>
            <li>Ano de fabricação: <strong>{r.preenche.anoFabricacao}</strong></li>
            <li>Quilometragem: <strong>{r.preenche.km}</strong></li>
          </ul>
          {r.preenche.km === 0 && r.aplicados > 0 && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              A planilha do AutoCerto também não tem a quilometragem. Ela precisa ser informada carro por carro antes de ir à venda.
            </p>
          )}
          {r.placasRepetidas.length > 0 && <p className="text-xs text-amber-700">Placa já usada em outro carro do estoque (não aplicada): {r.placasRepetidas.join(", ")}.</p>}
          {r.previa.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="py-1 font-medium">Carro</th>
                  <th className="py-1 font-medium">Placa</th>
                  <th className="py-1 text-right font-medium">Preço</th>
                  <th className="py-1 text-right font-medium">FIPE</th>
                </tr>
              </thead>
              <tbody>
                {r.previa.map((p, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="py-1">{p.nome}</td>
                    <td className="py-1">{p.placa ?? "—"}</td>
                    <td className="py-1 text-right tabular-nums">{p.precoCents > 0 ? reais(p.precoCents) : "—"}</td>
                    <td className="py-1 text-right tabular-nums">{p.fipeCents ? reais(p.fipeCents) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!feito && r.aplicados > 0 && (
            <div>
              <button className={botaoPrimario} disabled={ocupado} onClick={() => enviar(false)}>
                {ocupado ? "Completando…" : `Completar ${r.aplicados} ficha(s)`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
