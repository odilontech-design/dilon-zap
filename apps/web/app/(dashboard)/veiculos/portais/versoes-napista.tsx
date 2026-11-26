"use client";

import { useState } from "react";
import { botaoPrimario, botaoSecundario, campo, erroDaResposta } from "../comum";

type Opcao = { id: string; nome: string; nota: number };
type Pendencia = { veiculoId: string; nome: string; placa: string | null; anoModelo: number; pedida: string | null; estado: "ok" | "sem-marca" | "sem-modelo"; mensagem: string | null; opcoes: Opcao[]; sugerida: string | null };
type Resposta = { total: number; itens: Pendencia[] };

const POR_TELA = 12;

/**
 * Carros que o NaPista ainda não casou com uma versão do catálogo: mostra a versão da ficha, as
 * opções do catálogo (a mais parecida já marcada, quando é boa) e a gestão confere e salva. Os
 * carros salvos voltam à fila e o Zap publica no próximo ciclo.
 */
export function EscolherVersoesNapista({ pendentes, aoSalvar }: { pendentes: number; aoSalvar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [deslocar, setDeslocar] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);

  async function carregar(de: number) {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/portais/napista/versoes?limite=${POR_TELA}&deslocar=${de}`);
      if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
      const d = (await r.json()) as Resposta;
      setDados(d);
      setDeslocar(de);
      setEscolhas(Object.fromEntries(d.itens.filter((i) => i.sugerida).map((i) => [i.veiculoId, i.sugerida as string])));
    } finally {
      setOcupado(false);
    }
  }

  async function salvar() {
    const lista = Object.entries(escolhas).filter(([, v]) => v).map(([veiculoId, versaoId]) => ({ veiculoId, versaoId }));
    if (!lista.length) return setAviso({ texto: "Escolha a versão de pelo menos um carro.", erro: true });
    setOcupado(true);
    setAviso(null);
    try {
      const r = await fetch("/api/portais/napista/versoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ escolhas: lista }) });
      if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
      const d = (await r.json()) as { salvas: number; recusadas: { veiculoId: string; motivo: string }[] };
      aoSalvar();
      setAviso({ texto: `${d.salvas} carro(s) voltaram para a fila e entram no NaPista nos próximos minutos.${d.recusadas.length ? ` ${d.recusadas.length} não foram aceitos: ${d.recusadas[0].motivo}.` : ""}`, erro: d.recusadas.length > 0 });
      await carregar(0);
    } finally {
      setOcupado(false);
    }
  }

  if (!aberto) {
    return (
      <div>
        <button
          type="button"
          className={botaoSecundario}
          onClick={() => {
            setAberto(true);
            carregar(0);
          }}
        >
          Escolher as versões pendentes{pendentes > 0 ? ` (${pendentes})` : ""}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3" data-testid="versoes-napista">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Versões do catálogo do NaPista</h3>
        <button type="button" className="text-xs text-neutral-500 hover:underline" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        O NaPista pede a versão exata do catálogo deles. Onde o Zap não teve certeza, a mais parecida já vem marcada: confira a versão do carro e ajuste se precisar. Só os carros com uma versão escolhida são salvos.
      </p>
      {aviso && <p className={`rounded-md px-3 py-2 text-xs ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}
      {!dados && ocupado && <p className="text-xs text-neutral-500">Buscando no catálogo do NaPista…</p>}
      {dados && dados.itens.length === 0 && <p className="text-sm text-neutral-600">Nenhum carro esperando versão.</p>}
      {dados && dados.itens.length > 0 && (
        <>
          <ul className="flex flex-col divide-y divide-neutral-100">
            {dados.itens.map((i) => (
              <li key={i.veiculoId} className="flex flex-col gap-1.5 py-2.5">
                <p className="text-sm font-medium">
                  {i.nome}
                  {i.placa ? <span className="ml-2 text-xs font-normal text-neutral-500">{i.placa}</span> : null}
                </p>
                <p className="text-xs text-neutral-500">Na ficha: {i.pedida ? `“${i.pedida}”` : "sem versão"}</p>
                {i.estado === "ok" ? (
                  <select
                    className={campo}
                    aria-label={`Versão do catálogo para ${i.nome}`}
                    value={escolhas[i.veiculoId] ?? ""}
                    onChange={(e) => setEscolhas((a) => ({ ...a, [i.veiculoId]: e.target.value }))}
                  >
                    <option value="">Escolher a versão…</option>
                    {i.opcoes.map((o, n) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                        {n === 0 && o.nota >= 0.5 ? " (mais parecida)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                    {i.mensagem}. Confira marca, modelo e ano na ficha do carro; se estiverem certos, esse carro não está no catálogo do NaPista para esse ano.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={botaoPrimario} disabled={ocupado} onClick={salvar}>
              {ocupado ? "Salvando…" : `Salvar ${Object.values(escolhas).filter(Boolean).length} escolha(s)`}
            </button>
            {deslocar + POR_TELA < dados.total && (
              <button type="button" className={botaoSecundario} disabled={ocupado} onClick={() => carregar(deslocar + POR_TELA)}>
                Ver os próximos
              </button>
            )}
            <span className="text-xs text-neutral-500">{dados.total} carro(s) esperando versão</span>
          </div>
        </>
      )}
    </div>
  );
}
