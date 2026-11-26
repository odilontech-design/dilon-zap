"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { lerReais } from "@/lib/otica-regras";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import { avisoDeKm, csvDaLista, kmRepetidos, lerKm, lerListaColada } from "@/lib/veiculos-completar-km";
import { botaoPrimario, botaoSecundario, campo, erroDaResposta, fetcher, secao } from "../comum";

type Linha = { id: string; placa: string | null; marca: string; modelo: string; versao: string | null; anoFabricacao: number; anoModelo: number; km: number; kmInformado: boolean; precoCents: number; status: string };
type Edicao = { km: string; preco: string };

/**
 * Completar o cadastro: só os carros que ainda não têm quilometragem informada
 * ou preço. A equipe digita km (e acerta o preço) numa tabela, sem abrir a
 * ficha de cada carro; "Salvar e colocar à venda" já libera os que ficaram completos.
 */
export function CompletarEstoque() {
  const { data, mutate, isLoading } = useSWR<{ veiculos: Linha[] }>("/api/veiculos", fetcher);
  const [ed, setEd] = useState<Record<string, Edicao>>({});
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [colado, setColado] = useState("");

  const pendentes = useMemo(() => (data?.veiculos ?? []).filter((v) => ["PREPARACAO", "DISPONIVEL", "RESERVADO"].includes(v.status) && (!v.kmInformado || v.precoCents <= 0)), [data]);
  const valor = (v: Linha): Edicao => ed[v.id] ?? { km: "", preco: v.precoCents > 0 ? (v.precoCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "" };
  const mudar = (v: Linha, parte: Partial<Edicao>) => setEd((e) => ({ ...e, [v.id]: { ...valor(v), ...parte } }));

  // O que será enviado: km digitada, e preço só se mudou ou se o carro estava sem.
  const itens = useMemo(() => {
    const lista: { id: string; km?: number; precoCents?: number }[] = [];
    let invalidos = 0;
    for (const v of pendentes) {
      const e = ed[v.id];
      if (!e) continue;
      const km = lerKm(e.km);
      const preco = lerReais(e.preco);
      if (km === undefined || preco === undefined) invalidos++;
      const item: { id: string; km?: number; precoCents?: number } = { id: v.id };
      if (typeof km === "number") item.km = km;
      if (typeof preco === "number" && preco > 0 && preco !== v.precoCents) item.precoCents = preco;
      if (item.km !== undefined || item.precoCents !== undefined) lista.push(item);
    }
    return { lista, invalidos };
  }, [ed, pendentes]);

  /** Preenche a km dos carros pela placa a partir da lista colada (Excel ou bloco de notas). Nada é salvo antes de clicar em Salvar. */
  function aplicarColado() {
    const r = lerListaColada(colado, pendentes);
    setEd((e) => {
      const n = { ...e };
      for (const v of pendentes) if (r.preenchidos[v.id] !== undefined) n[v.id] = { ...valor(v), ...(e[v.id] ?? {}), km: r.preenchidos[v.id] };
      return n;
    });
    const partes = [`${Object.keys(r.preenchidos).length} carro(s) preenchido(s)`, r.semCarro.length ? `${r.semCarro.length} placa(s) que não estão nesta lista (${r.semCarro.slice(0, 3).join(", ")}${r.semCarro.length > 3 ? "…" : ""})` : null, r.invalidas.length ? `${r.invalidas.length} linha(s) que não entendi` : null].filter(Boolean);
    setAviso({ texto: `${partes.join("; ")}. Confira na tabela e clique em Salvar.`, erro: r.semCarro.length + r.invalidas.length > 0 });
    if (!r.semCarro.length && !r.invalidas.length) setColado("");
  }

  function baixarLista() {
    const csv = csvDaLista(pendentes.map((v) => ({ placa: v.placa, nome: nomeDoVeiculo(v) })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "carros-sem-km.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Enter desce para a km do carro de baixo. */
  function descer(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const campos = Array.from(document.querySelectorAll<HTMLInputElement>("[data-campo-km]"));
    campos[campos.indexOf(ev.currentTarget) + 1]?.focus();
  }

  const repetido = kmRepetidos(pendentes.map((v) => lerKm(valor(v).km)));

  async function salvar(colocarAVenda: boolean) {
    setAviso(null);
    if (itens.invalidos) return setAviso({ texto: "Há valores inválidos (km só com números; preço no formato 45.900,00).", erro: true });
    if (!itens.lista.length) return setAviso({ texto: "Digite a quilometragem de pelo menos um carro.", erro: true });
    setSalvando(true);
    try {
      const r = await fetch("/api/veiculos/completar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: itens.lista, colocarAVenda }) });
      if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
      const j = (await r.json()) as { salvos: number; colocados: number };
      setEd({});
      setAviso({ texto: `${j.salvos} carro(s) salvo(s)${colocarAVenda ? `, ${j.colocados} colocado(s) à venda` : ""}.` });
      mutate();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <section className={secao}>
        <h2 className="text-sm font-semibold">Completar o cadastro</h2>
        <p className="text-xs text-neutral-500">
          Estes carros ainda não têm a quilometragem informada (ou estão sem preço). Os portais (Webmotors, MobiAuto, Na Pista, OLX) exigem a km, e o Zap não anuncia carro sem ela. Digite a km de cada um, use Tab para ir ao próximo e salve.
        </p>
      </section>

      {aviso && (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>
          {aviso.texto}
        </p>
      )}
      {isLoading && <p className="text-sm text-neutral-500">Carregando…</p>}
      {!isLoading && pendentes.length === 0 && <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">Tudo completo: todos os carros do pátio têm km e preço.</p>}

      {pendentes.length > 0 && (
        <>
          <details className="rounded-lg border border-neutral-200 bg-surface p-3 text-sm">
            <summary className="cursor-pointer font-medium">Colar a km de uma planilha ou baixar a lista</summary>
            <p className="mt-2 text-xs text-neutral-500">
              Baixe a lista dos carros sem km, leve ao pátio e anote a km lida no odômetro. Depois cole aqui uma linha por carro, com a placa e a km (ex.: LSE7D72 84203). Só vale a km real: o Zap não preenche número padrão.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={botaoSecundario} onClick={baixarLista}>Baixar a lista (CSV)</button>
            </div>
            <textarea aria-label="Lista colada: placa e km" rows={5} value={colado} onChange={(x) => setColado(x.target.value)} placeholder={"LSE7D72\t84203\nKRR4E42\t45300"} className={`${campo} mt-2 w-full font-mono text-xs`} />
            <div className="mt-2">
              <button type="button" className={botaoSecundario} disabled={!colado.trim()} onClick={aplicarColado}>Preencher a tabela</button>
            </div>
          </details>
          {repetido && (
            <p role="alert" className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              Você digitou {repetido.km.toLocaleString("pt-BR")} km em {repetido.quantos} carros. Confira se não é um valor padrão: a km precisa ser a lida no odômetro de cada carro, porque o comprador vê esse número no anúncio.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-neutral-600">{pendentes.length} carro(s) para completar · {itens.lista.length} preenchido(s) agora</span>
            <button className={botaoPrimario} disabled={salvando || !itens.lista.length} onClick={() => salvar(false)}>Salvar</button>
            <button className={botaoSecundario} disabled={salvando || !itens.lista.length} onClick={() => salvar(true)}>Salvar e colocar à venda</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
            <table className="w-full text-sm" data-testid="tabela-completar">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Carro</th>
                  <th className="px-3 py-2 font-medium">Placa</th>
                  <th className="w-40 px-3 py-2 font-medium">Km</th>
                  <th className="w-44 px-3 py-2 font-medium">Preço (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pendentes.map((v) => {
                  const e = valor(v);
                  const kmRuim = e.km !== "" && lerKm(e.km) === undefined;
                  const precoRuim = lerReais(e.preco) === undefined;
                  return (
                    <tr key={v.id}>
                      <td className="px-3 py-2">
                        <Link href={`/veiculos/${v.id}`} className="font-medium hover:underline">{nomeDoVeiculo(v)}</Link>
                        <span className="ml-2 text-xs text-neutral-400">{v.status === "PREPARACAO" ? "em preparação" : v.status === "RESERVADO" ? "reservado" : "disponível"}</span>
                      {(() => {
                          const aviso = avisoDeKm(lerKm(e.km), v.anoModelo);
                          return aviso ? <p className="mt-1 text-xs text-amber-700">{aviso}</p> : null;
                        })()}
                      </td>
                      <td className="px-3 py-2 text-neutral-500">{v.placa ?? "—"}</td>
                      <td className="px-3 py-2">
                        <input data-campo-km aria-label={`Km de ${nomeDoVeiculo(v)}`} inputMode="numeric" value={e.km} onKeyDown={descer} onChange={(x) => mudar(v, { km: x.target.value })} placeholder="ex.: 45300" className={`${campo} w-full ${kmRuim ? "border-red-500" : ""}`} />
                      </td>
                      <td className="px-3 py-2">
                        <input aria-label={`Preço de ${nomeDoVeiculo(v)}`} inputMode="decimal" value={e.preco} onChange={(x) => mudar(v, { preco: x.target.value })} placeholder="0,00" className={`${campo} w-full ${precoRuim ? "border-red-500" : ""}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
