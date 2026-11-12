"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CamposVeiculo, FORM_VAZIO, paraRota, type FormVeiculo } from "./campos-veiculo";
import {
  BuscaCliente,
  CampoDinheiro,
  botaoPrimario,
  brl,
  campo,
  clienteParaRota,
  diaDaqui,
  diaParaISO,
  erroDaResposta,
  rotulo,
  secao,
  type ClienteEscolhido,
} from "./comum";

const FORMAS = [
  ["PIX", "Pix"],
  ["TRANSFERENCIA", "Transferência"],
  ["DINHEIRO", "Dinheiro"],
  ["BOLETO", "Boleto"],
  ["CHEQUE", "Cheque"],
  ["CARTAO", "Cartão"],
  ["OUTRO", "Outro"],
] as const;

/**
 * Entrada de um carro no estoque. Compra: o valor pago vira o primeiro custo
 * do carro e, se pedido, uma conta a pagar ao vendedor (quitada quando já foi
 * pago). Consignação: o dono e o valor líquido que ele recebe quando a loja
 * vender, sem dinheiro saindo agora.
 */
export function FormularioEntrada() {
  const router = useRouter();
  const [f, setF] = useState<FormVeiculo>(FORM_VAZIO);
  const [origem, setOrigem] = useState<"COMPRA" | "CONSIGNACAO">("COMPRA");
  const [disponivel, setDisponivel] = useState(false);
  const [dataEntrada, setDataEntrada] = useState(diaDaqui(0));
  const [valorCompra, setValorCompra] = useState<number | null>(null);
  const [lancarPagar, setLancarPagar] = useState(true);
  const [fornecedor, setFornecedor] = useState("");
  const [forma, setForma] = useState<(typeof FORMAS)[number][0]>("PIX");
  const [vencimento, setVencimento] = useState(diaDaqui(0));
  const [jaPago, setJaPago] = useState(true);
  const [dono, setDono] = useState<ClienteEscolhido>(null);
  const [valorDono, setValorDono] = useState<number | null>(null);
  const [consignadoAte, setConsignadoAte] = useState(diaDaqui(90));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    let veiculo;
    try {
      veiculo = paraRota(f, { exigirPreco: true, gerencia: true });
      if (origem === "COMPRA" && !valorCompra) throw new Error("informe quanto a loja pagou no carro");
      if (origem === "COMPRA" && lancarPagar && !fornecedor.trim()) throw new Error("informe de quem a loja comprou");
      if (origem === "CONSIGNACAO" && !dono) throw new Error("escolha o dono do carro");
      if (origem === "CONSIGNACAO" && !valorDono) throw new Error("informe quanto o dono recebe na venda");
    } catch (x) {
      setErro((x as Error).message);
      return;
    }
    setSalvando(true);
    const r = await fetch("/api/veiculos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        veiculo,
        origem,
        disponivel,
        entradaEm: diaParaISO(dataEntrada) ?? undefined,
        compra:
          origem === "COMPRA"
            ? { valorCents: valorCompra, pagar: lancarPagar ? { fornecedorNome: fornecedor.trim(), forma, vencimento: diaParaISO(vencimento), jaPago } : null }
            : null,
        consignacao: origem === "CONSIGNACAO" ? { dono: clienteParaRota(dono), valorLiquidoCents: valorDono, ate: diaParaISO(consignadoAte) } : null,
      }),
    });
    setSalvando(false);
    if (!r.ok) {
      setErro(await erroDaResposta(r));
      return;
    }
    const { id } = await r.json();
    router.push(`/veiculos/${id}`);
  }

  const margemPrevista = f.precoCents && (origem === "COMPRA" ? valorCompra : valorDono) ? f.precoCents - (origem === "COMPRA" ? valorCompra! : valorDono!) : null;

  return (
    <form onSubmit={salvar} className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Entrada de veículo</h1>
        <Link href="/veiculos" className="text-sm text-neutral-500 hover:text-neutral-800">
          voltar ao estoque
        </Link>
      </div>

      <section className={secao}>
        <h2 className="text-sm font-semibold">Como o carro entrou</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ["COMPRA", "Compra (a loja pagou)"],
              ["CONSIGNACAO", "Consignação (do dono, a loja vende)"],
            ] as const
          ).map(([v, r]) => (
            <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${origem === v ? "border-accent bg-accent/5" : "border-neutral-300"}`}>
              <input type="radio" name="origem" checked={origem === v} onChange={() => setOrigem(v)} />
              {r}
            </label>
          ))}
        </div>
        <p className="text-xs text-neutral-500">Carro que entra como troca numa venda é cadastrado pela própria venda.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Data de entrada</span>
            <input id="entrada-data" type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} className={campo} />
          </label>
        </div>

        {origem === "COMPRA" && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className={rotulo}>Valor pago no carro</span>
                <CampoDinheiro id="entrada-compra" valor={valorCompra} onChange={setValorCompra} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lancarPagar} onChange={(e) => setLancarPagar(e.target.checked)} />
              Lançar em contas a pagar
            </label>
            {lancarPagar && (
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className={rotulo}>Comprado de</span>
                  <input id="entrada-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Nome de quem vendeu o carro" className={campo} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={rotulo}>Forma</span>
                  <select id="entrada-forma" value={forma} onChange={(e) => setForma(e.target.value as typeof forma)} className={campo}>
                    {FORMAS.map(([v, r]) => (
                      <option key={v} value={v}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={rotulo}>Vencimento</span>
                  <input id="entrada-venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} />
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-4">
                  <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} />
                  Já foi pago (lança e dá baixa)
                </label>
              </div>
            )}
          </div>
        )}

        {origem === "CONSIGNACAO" && (
          <div className="flex flex-col gap-3">
            <span className={rotulo}>Dono do carro</span>
            <BuscaCliente id="entrada-dono" valor={dono} onChange={setDono} rotuloNovo="Dono novo? Nome e WhatsApp:" />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className={rotulo}>O dono recebe (líquido)</span>
                <CampoDinheiro id="entrada-valor-dono" valor={valorDono} onChange={setValorDono} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={rotulo}>Consignado até</span>
                <input id="entrada-consig-ate" type="date" value={consignadoAte} onChange={(e) => setConsignadoAte(e.target.value)} className={campo} />
              </label>
            </div>
          </div>
        )}
      </section>

      <section className={secao}>
        <h2 className="text-sm font-semibold">O carro</h2>
        <CamposVeiculo f={f} set={(p) => setF((x) => ({ ...x, ...p }))} gerencia />
        {margemPrevista !== null && (
          <p className={`text-xs ${margemPrevista < 0 ? "text-red-600" : "text-neutral-500"}`}>
            Margem antes dos gastos de preparação: {brl(margemPrevista)}
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={disponivel} onChange={(e) => setDisponivel(e.target.checked)} />
          Já está pronto para vender (senão entra como “em preparação”)
        </label>
      </section>

      {erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{erro}</p>}
      <div className="flex justify-end">
        <button disabled={salvando} className={botaoPrimario}>
          {salvando ? "Salvando…" : "Dar entrada"}
        </button>
      </div>
    </form>
  );
}
