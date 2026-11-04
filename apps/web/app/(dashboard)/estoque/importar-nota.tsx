"use client";

import { useState } from "react";
import { centsToBRL } from "@/lib/billing";
import { CampoCategoria, useCategorias } from "@/components/campo-categoria";

type Item = {
  n: number;
  codigo: string;
  ean: string | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  custoTotalCents: number;
  sugestaoProductId: string | null;
};
type Previa = {
  chave: string;
  numero: string;
  emitidaEm: string | null;
  emitente: { nome: string; cnpj: string | null };
  valorCents: number;
  itens: Item[];
  duplicatas: { numero: string; vencimento: string; valorCents: number }[];
  jaImportadaEm: string | null;
  produtos: { id: string; nome: string; sku: string | null; estoque: number }[];
  comFinanceiro: boolean;
};
type Linha = { productId: string; quantidade: string };

const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/**
 * Importar a nota de compra pelo XML (reunião Believe, 29/10). Lê a nota,
 * sugere o produto de cada item e deixa conferir antes de lançar: quantas
 * unidades entram (a nota pode vir em caixa) e se as duplicatas vão para o
 * A pagar.
 */
export function ImportarNota({ onFechar, onImportada }: { onFechar: () => void; onImportada: (msg: string) => void }) {
  const [xml, setXml] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [linhas, setLinhas] = useState<Record<number, Linha>>({});
  const [lancarConta, setLancarConta] = useState(true);
  const [categoriaId, setCategoriaId] = useState("");
  const [vencimentoUnico, setVencimentoUnico] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { categorias } = useCategorias();

  async function ler(arquivo: File) {
    setErro(null);
    setPrevia(null);
    if (arquivo.size > 2_000_000) return setErro("arquivo grande demais para ser um XML de nota");
    const texto = await arquivo.text();
    setOcupado(true);
    const res = await fetch("/api/estoque/nfe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "ler", xml: texto }) });
    setOcupado(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(typeof body.error === "string" ? body.error : "não deu pra ler a nota");
    const p = body as Previa;
    setXml(texto);
    setPrevia(p);
    setLinhas(Object.fromEntries(p.itens.map((i) => [i.n, { productId: i.sugestaoProductId ?? "", quantidade: String(Math.round(i.quantidade)) }])));
    setLancarConta(p.comFinanceiro);
    // Compra de mercadoria cai, por padrão, em "Compras para revenda".
    const compras = categorias?.find((c) => c.tipo === "DESPESA" && c.ativa && c.nome === "Compras para revenda");
    if (compras) setCategoriaId(compras.id);
  }

  async function importar() {
    if (!previa || !xml) return;
    const itens = previa.itens
      .filter((i) => linhas[i.n]?.productId)
      .map((i) => ({ n: i.n, productId: linhas[i.n].productId, quantidade: Number(linhas[i.n].quantidade) }));
    if (itens.some((i) => !Number.isInteger(i.quantidade) || i.quantidade <= 0)) return setErro("confira as quantidades: precisam ser números inteiros maiores que zero");
    const parcelas = previa.duplicatas.length
      ? previa.duplicatas.map((d) => ({ vencimento: d.vencimento, valorCents: d.valorCents }))
      : vencimentoUnico
        ? [{ vencimento: vencimentoUnico, valorCents: previa.valorCents }]
        : [];
    if (lancarConta && parcelas.length === 0) return setErro("a nota não traz duplicatas: informe o vencimento para o A pagar");
    if (itens.length === 0 && !lancarConta) return setErro("ligue pelo menos um item a um produto, ou lance a conta a pagar");
    const ignorados = previa.itens.length - itens.length;
    if (ignorados > 0 && !confirm(`${ignorados} item(ns) sem produto escolhido não vão entrar no estoque. Continuar?`)) return;

    setErro(null);
    setOcupado(true);
    const res = await fetch("/api/estoque/nfe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "importar", xml, itens, contaPagar: lancarConta ? { categoriaId: categoriaId || null, parcelas } : null }),
    });
    setOcupado(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(typeof body.error === "string" ? body.error : "não deu pra importar");
    onImportada(`NF ${previa.numero} importada: ${itens.length} item(ns) no estoque${lancarConta ? " e conta lançada no A pagar" : ""}.`);
  }

  const campo = "rounded-md border border-neutral-300 bg-surface px-2 py-1 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="bg-surface rounded-lg shadow-lg w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Importar nota fiscal (XML)</h2>
            <p className="text-xs text-neutral-500">Dá entrada no estoque com o custo da nota e lança as duplicatas no A pagar.</p>
          </div>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none" aria-label="Fechar">
            ×
          </button>
        </div>

        <label className="text-sm">
          <span className="block text-xs font-medium text-neutral-700 mb-1">Arquivo XML da NF-e</span>
          <input type="file" accept=".xml,text/xml,application/xml" disabled={ocupado} onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
        </label>

        {ocupado && <p className="text-sm text-neutral-400">Processando…</p>}
        {erro && <p className="text-sm text-red-600">{erro}</p>}

        {previa && (
          <>
            <div className="rounded-md bg-neutral-50 px-3 py-2 text-sm flex flex-wrap gap-x-6 gap-y-1">
              <span>
                <strong className="font-medium">NF {previa.numero}</strong>
                {previa.emitidaEm && <> · {dataBR(previa.emitidaEm)}</>}
              </span>
              <span>{previa.emitente.nome}</span>
              <span className="tabular-nums">Total {centsToBRL(previa.valorCents)}</span>
            </div>
            {previa.jaImportadaEm && (
              <p className="text-sm text-red-600">Esta nota já foi importada em {dataBR(previa.jaImportadaEm)}. Importar de novo dobraria o estoque — o sistema não deixa.</p>
            )}

            <div className="overflow-x-auto rounded-md border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Item da nota</th>
                    <th className="text-right font-medium px-3 py-2">Na nota</th>
                    <th className="text-left font-medium px-3 py-2">Produto no estoque</th>
                    <th className="text-right font-medium px-3 py-2">Unidades que entram</th>
                    <th className="text-right font-medium px-3 py-2">Custo/un.</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.itens.map((i) => {
                    const l = linhas[i.n] ?? { productId: "", quantidade: "" };
                    const qtd = Number(l.quantidade);
                    const custoUn = Number.isInteger(qtd) && qtd > 0 ? Math.round(i.custoTotalCents / qtd) : null;
                    return (
                      <tr key={i.n} className="border-t border-neutral-100 align-top">
                        <td className="px-3 py-2">
                          <p className="font-medium">{i.descricao}</p>
                          <p className="text-[11px] text-neutral-400">
                            cód. {i.codigo}
                            {i.ean && <> · EAN {i.ean}</>}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {i.quantidade.toLocaleString("pt-BR")} {i.unidade}
                          <p className="text-[11px] text-neutral-400">{centsToBRL(i.custoTotalCents)}</p>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={l.productId}
                            onChange={(e) => setLinhas({ ...linhas, [i.n]: { ...l, productId: e.target.value } })}
                            className={`${campo} w-full max-w-[260px]`}
                          >
                            <option value="">Não lançar no estoque</option>
                            {previa.produtos.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku ? `${p.sku} · ` : ""}
                                {p.nome}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            value={l.quantidade}
                            onChange={(e) => setLinhas({ ...linhas, [i.n]: { ...l, quantidade: e.target.value } })}
                            inputMode="numeric"
                            disabled={!l.productId}
                            aria-label={`Unidades do item ${i.n}`}
                            className={`${campo} w-20 text-right tabular-nums disabled:opacity-40`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.productId && custoUn !== null ? centsToBRL(custoUn) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-neutral-500">
              Se a nota vem em caixa ou pacote, informe quantas unidades entram — o custo por unidade se ajusta. O custo inclui IPI, ST e frete do item, com o desconto. Produto sem código ganha o código do fornecedor, para a próxima nota já vir ligada.
            </p>

            {previa.comFinanceiro && (
              <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={lancarConta} onChange={(e) => setLancarConta(e.target.checked)} />
                  Lançar no A pagar
                </label>
                {lancarConta && (
                  <>
                    {previa.duplicatas.length > 0 ? (
                      <ul className="text-xs text-neutral-600 tabular-nums">
                        {previa.duplicatas.map((d, k) => (
                          <li key={k}>
                            Boleto {k + 1} de {previa.duplicatas.length} · vence {dataBR(d.vencimento)} · {centsToBRL(d.valorCents)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <label className="text-xs text-neutral-600 flex items-center gap-2">
                        A nota não traz duplicatas. Vencimento do total:
                        <input type="date" value={vencimentoUnico} onChange={(e) => setVencimentoUnico(e.target.value)} className={campo} />
                      </label>
                    )}
                    <label className="text-xs text-neutral-600 flex items-center gap-2">
                      Categoria
                      <CampoCategoria tipo="DESPESA" value={categoriaId} onChange={setCategoriaId} className={`${campo} max-w-[260px]`} />
                    </label>
                    <p className="text-[11px] text-neutral-500">Fornecedor: {previa.emitente.nome} (criado no A pagar se ainda não existir).</p>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
                Cancelar
              </button>
              <button
                onClick={importar}
                disabled={ocupado || !!previa.jaImportadaEm}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Importar nota
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
