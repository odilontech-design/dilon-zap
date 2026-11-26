"use client";

import { useRef, useState } from "react";
import { botaoPrimario, botaoSecundario, erroDaResposta, secao } from "../comum";

type Resultado = {
  abas: string[];
  linhas: number;
  comProblema: { aba: string; linha: number; erro: string }[];
  jaImportadas: number;
  conflitos: { aba: string; linha: number; placa: string; motivo: string }[];
  aImportar: number;
  carrosNovos: number;
  compradoresNovos: number;
  importadas: number;
  semDataExata: number;
  comTroca: number;
  falhas: { aba: string; linha: number; erro: string }[];
};

function paraBase64(bytes: ArrayBuffer): string {
  let s = "";
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Traz o controle de vendas que a loja faz na planilha (uma aba por mês) para dentro do Zap: cada linha vira
 * uma venda concluída, com o comprador (CPF, RG, endereço) no contato. Os relatórios de vendas passam a valer.
 */
export function ImportarVendas() {
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<string | null>(null);
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
    setArquivo(paraBase64(await f.arrayBuffer()));
    setNome(f.name);
  }

  async function enviar(simular: boolean) {
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/veiculos/importar/vendas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivoBase64: arquivo, simular }) });
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
      <h2 className="text-sm font-semibold">Importar o controle de vendas (planilha)</h2>
      <p className="text-xs text-neutral-500">
        Envie a planilha de controle de vendas (.xlsx, uma aba por mês: JANEIRO, FEVEREIRO…). Cada linha vira uma venda concluída, com o comprador (nome, telefone, CPF, RG e endereço) salvo
        como contato. O valor da venda é aproximado (financiado + entrada em dinheiro), porque a planilha não traz o preço. Enviar de novo a mesma planilha não duplica. Os dados pessoais
        dos compradores ficam só na sua empresa.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={entrada} type="file" accept=".xlsx" className="hidden" aria-label="Escolher a planilha de vendas" onChange={(e) => ler(e.target.files?.[0])} />
        <button type="button" className={botaoSecundario} onClick={() => entrada.current?.click()}>
          Escolher a planilha
        </button>
        {nome && <span className="text-sm text-neutral-600">{nome}</span>}
        <button type="button" className={botaoPrimario} disabled={!arquivo || ocupado} onClick={() => enviar(true)}>
          {ocupado && !r ? "Lendo…" : "Conferir"}
        </button>
      </div>
      {erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{erro}</p>}

      {r && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">
              {r.linhas} venda(s) lida(s) em {r.abas.length} aba(s)
            </span>
            {feito ? (
              <span className="rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">{r.importadas} venda(s) importada(s)</span>
            ) : (
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{r.aImportar} venda(s) seriam importadas</span>
            )}
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{r.carrosNovos} carro(s) novo(s) no histórico</span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{r.compradoresNovos} comprador(es) novo(s)</span>
            {r.jaImportadas > 0 && <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{r.jaImportadas} já importada(s) antes</span>}
            {r.comProblema.length > 0 && <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-700">{r.comProblema.length} linha(s) com problema</span>}
            {r.conflitos.length > 0 && <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-700">{r.conflitos.length} conflito(s)</span>}
            {r.falhas.length > 0 && <span className="rounded-full bg-red-500/10 px-3 py-1 text-red-600">{r.falhas.length} falha(s) ao gravar</span>}
          </div>
          {r.semDataExata > 0 && <p className="text-xs text-amber-700">{r.semDataExata} venda(s) sem data na planilha: usado o dia 1 do mês da aba.</p>}
          {r.comTroca > 0 && <p className="text-xs text-neutral-500">{r.comTroca} venda(s) com carro na troca: o valor do carro da troca não entra no valor da venda.</p>}
          {[...r.comProblema.map((p) => ({ ...p, motivo: p.erro })), ...r.conflitos, ...r.falhas.map((p) => ({ ...p, motivo: p.erro }))].length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-neutral-600">Ver as linhas que não entraram</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {r.comProblema.map((p, i) => (
                  <li key={`p${i}`}>
                    {p.aba}, linha {p.linha}: {p.erro}
                  </li>
                ))}
                {r.conflitos.map((p, i) => (
                  <li key={`c${i}`}>
                    {p.aba}, linha {p.linha} ({p.placa}): {p.motivo}
                  </li>
                ))}
                {r.falhas.map((p, i) => (
                  <li key={`f${i}`}>
                    {p.aba}, linha {p.linha}: {p.erro}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!feito && r.aImportar > 0 && (
            <div>
              <button className={botaoPrimario} disabled={ocupado} onClick={() => enviar(false)}>
                {ocupado ? "Importando…" : `Importar ${r.aImportar} venda(s)`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
