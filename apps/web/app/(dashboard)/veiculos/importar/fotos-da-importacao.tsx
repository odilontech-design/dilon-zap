"use client";

import { useEffect, useRef, useState } from "react";
import { botaoSecundario, erroDaResposta, secao } from "../comum";

export type EstadoFotos = { restantes: number; baixadas: number; falhas: string[]; rodando: boolean; total: number };

/**
 * Download em lotes das fotos que uma importação (planilha ou site) deixou na
 * fila: 70 carros × 10 fotos não cabem numa requisição só. Retoma de onde
 * parou se a aba foi fechada no meio.
 */
export function useFotosDaImportacao(onErro: (texto: string) => void) {
  const [fotos, setFotos] = useState<EstadoFotos | null>(null);
  const parar = useRef(false);

  useEffect(() => {
    fetch("/api/veiculos/importar/fotos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.restantes && setFotos({ restantes: d.restantes, baixadas: 0, falhas: [], rodando: false, total: d.restantes }));
  }, []);

  async function baixarFotos() {
    parar.current = false;
    const inicio = await fetch("/api/veiculos/importar/fotos").then((r) => r.json());
    let estado: EstadoFotos = { restantes: inicio.restantes as number, baixadas: 0, falhas: [], rodando: true, total: inicio.restantes as number };
    setFotos(estado);
    while (estado.restantes > 0 && !parar.current) {
      const r = await fetch("/api/veiculos/importar/fotos", { method: "POST" });
      if (!r.ok) {
        onErro(await erroDaResposta(r));
        break;
      }
      const d = await r.json();
      estado = { ...estado, restantes: d.restantes, baixadas: estado.baixadas + d.baixadas, falhas: [...estado.falhas, ...d.falhas] };
      setFotos(estado);
      if (d.baixadas === 0 && d.falhas.length === 0) break;
    }
    setFotos({ ...estado, rodando: false });
  }

  return { fotos, baixarFotos, pausar: () => (parar.current = true) };
}

export function SecaoFotos({ titulo, fotos, baixarFotos, pausar }: { titulo: string; fotos: EstadoFotos | null; baixarFotos: () => void; pausar: () => void }) {
  if (!fotos || (fotos.restantes === 0 && fotos.baixadas === 0 && fotos.falhas.length === 0)) return null;
  return (
    <section className={secao}>
      <h2 className="text-sm font-semibold">{titulo}</h2>
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
          <button onClick={pausar} className="text-xs text-neutral-500 hover:text-neutral-800">
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
  );
}
