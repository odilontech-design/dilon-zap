"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MODELO_CSV } from "@/lib/veiculos-importacao";
import { botaoPrimario, botaoSecundario, brl, campo, erroDaResposta, secao } from "../comum";

type Resultado = {
  lidas: number;
  entram: number;
  criados: number;
  fotos: number;
  jaNoEstoque: { numero: number; motivo: string }[];
  erros: { numero: number; erro: string }[];
  ignoradas: string[];
  previa: { numero: number; nome: string; km: number; placa: string | null; precoCents: number; custoCents: number | null; fotos: number }[];
};

/**
 * Importa o estoque de uma planilha. Três passos na mesma tela: escolher o
 * arquivo (ou colar), conferir o que entra e importar. Depois, se a planilha
 * trouxe links de fotos, baixa em lotes mostrando o progresso.
 */
export function ImportarEstoque() {
  const [texto, setTexto] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [conferido, setConferido] = useState<Resultado | null>(null);
  const [feito, setFeito] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [fotos, setFotos] = useState<{ restantes: number; baixadas: number; falhas: string[]; rodando: boolean; total: number } | null>(null);
  const parar = useRef(false);

  // Fotos que ficaram para trás numa importação anterior (aba fechada no meio).
  useEffect(() => {
    fetch("/api/veiculos/importar/fotos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.restantes && setFotos({ restantes: d.restantes, baixadas: 0, falhas: [], rodando: false, total: d.restantes }));
  }, []);

  async function lerArquivo(f: File | undefined) {
    if (!f) return;
    setErro(null);
    setConferido(null);
    setFeito(null);
    if (/\.xlsx?$/i.test(f.name)) {
      setErro("Arquivo do Excel: abra no Excel e use Arquivo → Salvar como → CSV, e envie o .csv.");
      return;
    }
    // Planilha brasileira antiga costuma vir em Latin-1: se o UTF-8 der caractere quebrado, relê assim.
    const bytes = await f.arrayBuffer();
    let t = new TextDecoder("utf-8").decode(bytes);
    if (t.includes("�")) t = new TextDecoder("windows-1252").decode(bytes);
    setTexto(t);
    setNomeArquivo(f.name);
  }

  async function enviar(simular: boolean) {
    setErro(null);
    setOcupado(true);
    const r = await fetch("/api/veiculos/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto, simular }) });
    setOcupado(false);
    if (!r.ok) return setErro(await erroDaResposta(r));
    const d = (await r.json()) as Resultado;
    if (simular) setConferido(d);
    else {
      setFeito(d);
      setConferido(null);
      if (d.fotos > 0) baixarFotos();
    }
  }

  async function baixarFotos() {
    parar.current = false;
    const inicio = await fetch("/api/veiculos/importar/fotos").then((r) => r.json());
    let estado = { restantes: inicio.restantes as number, baixadas: 0, falhas: [] as string[], rodando: true, total: inicio.restantes as number };
    setFotos(estado);
    while (estado.restantes > 0 && !parar.current) {
      const r = await fetch("/api/veiculos/importar/fotos", { method: "POST" });
      if (!r.ok) {
        setErro(await erroDaResposta(r));
        break;
      }
      const d = await r.json();
      estado = { ...estado, restantes: d.restantes, baixadas: estado.baixadas + d.baixadas, falhas: [...estado.falhas, ...d.falhas] };
      setFotos(estado);
      if (d.baixadas === 0 && d.falhas.length === 0) break;
    }
    setFotos({ ...estado, rodando: false });
  }

  function baixarModelo() {
    const blob = new Blob(["﻿" + MODELO_CSV], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modelo-estoque-veiculos.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const r = conferido;
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <section className={secao}>
        <h2 className="text-sm font-semibold">1. A planilha do estoque</h2>
        <p className="text-sm text-neutral-600">
          Envie a planilha que a loja já usa, salva como <strong>CSV</strong>. As colunas são reconhecidas pelo nome: <strong>Marca, Modelo, Ano, KM e Preço</strong> são obrigatórias. As
          opcionais são versão, placa, cor, câmbio, combustível, custo, opcionais, descrição, data de entrada e <strong>fotos</strong> (links das imagens, separados por espaço).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${botaoSecundario} cursor-pointer`}>
            Escolher arquivo CSV
            <input type="file" accept=".csv,text/csv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => lerArquivo(e.target.files?.[0])} />
          </label>
          <button type="button" onClick={baixarModelo} className="text-sm text-accent hover:underline">
            Baixar planilha modelo
          </button>
          {nomeArquivo && <span className="text-xs text-neutral-500">{nomeArquivo}</span>}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-500">ou colar o conteúdo</summary>
          <textarea
            aria-label="Conteúdo da planilha"
            rows={6}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setNomeArquivo(null);
              setConferido(null);
            }}
            className={`${campo} mt-2 font-mono text-xs`}
            placeholder={MODELO_CSV.split("\n").slice(0, 2).join("\n")}
          />
        </details>
        <div>
          <button onClick={() => enviar(true)} disabled={!texto.trim() || ocupado} className={botaoPrimario}>
            {ocupado && !r ? "Conferindo…" : "Conferir"}
          </button>
        </div>
      </section>

      {erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{erro}</p>}

      {r && (
        <section className={secao}>
          <h2 className="text-sm font-semibold">2. Conferência</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">{r.entram} carro(s) vão entrar</span>
            {r.fotos > 0 && <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{r.fotos} foto(s) para baixar</span>}
            {r.jaNoEstoque.length > 0 && <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{r.jaNoEstoque.length} já estão no estoque</span>}
            {r.erros.length > 0 && <span className="rounded-full bg-red-500/10 px-3 py-1 text-red-600">{r.erros.length} linha(s) com problema</span>}
          </div>
          {r.previa.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="py-1 pr-2 font-normal">Linha</th>
                  <th className="py-1 pr-2 font-normal">Carro</th>
                  <th className="py-1 pr-2 font-normal">KM</th>
                  <th className="py-1 pr-2 text-right font-normal">Preço</th>
                  <th className="py-1 pr-2 text-right font-normal">Custo</th>
                  <th className="py-1 text-right font-normal">Fotos</th>
                </tr>
              </thead>
              <tbody>
                {r.previa.map((p) => (
                  <tr key={p.numero} className="border-t border-neutral-100">
                    <td className="py-1 pr-2 tabular-nums text-neutral-400">{p.numero}</td>
                    <td className="py-1 pr-2">
                      {p.nome}
                      {p.placa ? <span className="text-xs text-neutral-400"> · {p.placa}</span> : null}
                    </td>
                    <td className="py-1 pr-2 tabular-nums">{p.km.toLocaleString("pt-BR")}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{brl(p.precoCents)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{p.custoCents ? brl(p.custoCents) : "—"}</td>
                    <td className="py-1 text-right tabular-nums">{p.fotos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {r.entram > r.previa.length && <p className="text-xs text-neutral-500">Mostrando os primeiros {r.previa.length} de {r.entram}.</p>}
          {(r.erros.length > 0 || r.jaNoEstoque.length > 0) && (
            <ul className="max-h-48 overflow-auto rounded-md bg-neutral-50 p-3 text-xs">
              {r.erros.map((e) => (
                <li key={`e${e.numero}`} className="text-red-600">
                  Linha {e.numero}: {e.erro}
                </li>
              ))}
              {r.jaNoEstoque.map((e) => (
                <li key={`j${e.numero}`} className="text-neutral-500">
                  Linha {e.numero}: {e.motivo}, fica de fora
                </li>
              ))}
            </ul>
          )}
          {r.ignoradas.length > 0 && <p className="text-xs text-neutral-500">Colunas não usadas: {r.ignoradas.join(", ")}.</p>}
          <p className="text-xs text-neutral-500">
            Os carros entram como disponíveis. O custo informado vira o custo de compra do carro, sem lançar conta a pagar (o carro já está pago).
          </p>
          <div>
            <button onClick={() => enviar(false)} disabled={!r.entram || ocupado} className={botaoPrimario}>
              {ocupado ? "Importando…" : `Importar ${r.entram} carro(s)`}
            </button>
          </div>
        </section>
      )}

      {feito && (
        <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
          {feito.criados} carro(s) importado(s).{" "}
          <Link href="/veiculos" className="underline">
            Ver o estoque
          </Link>
        </p>
      )}

      {fotos && (fotos.restantes > 0 || fotos.baixadas > 0 || fotos.falhas.length > 0) && (
        <section className={secao}>
          <h2 className="text-sm font-semibold">3. Fotos</h2>
          {fotos.total > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(((fotos.total - fotos.restantes) / fotos.total) * 100)}%` }} />
            </div>
          )}
          <p className="text-sm">
            {fotos.baixadas} baixada(s){fotos.falhas.length ? `, ${fotos.falhas.length} com problema` : ""} · faltam {fotos.restantes}
          </p>
          {fotos.rodando ? (
            <p className="text-xs text-neutral-500">Baixando… mantenha esta página aberta. Se fechar, é só voltar aqui e continuar.</p>
          ) : fotos.restantes > 0 ? (
            <div>
              <button onClick={baixarFotos} className={botaoSecundario}>
                {fotos.baixadas || fotos.falhas.length ? "Continuar baixando" : "Baixar as fotos pendentes"}
              </button>
            </div>
          ) : null}
          {fotos.rodando && (
            <div>
              <button onClick={() => (parar.current = true)} className="text-xs text-neutral-500 hover:text-neutral-800">
                pausar
              </button>
            </div>
          )}
          {fotos.falhas.length > 0 && (
            <ul className="max-h-40 overflow-auto rounded-md bg-neutral-50 p-3 text-xs text-amber-700">
              {fotos.falhas.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
