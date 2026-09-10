"use client";

import { useState } from "react";
import { PLANOS, ROTULO_RECURSO, TODOS_RECURSOS, recursosEfetivos, type Plano, type Recurso } from "@/lib/plano-regras";

/**
 * Plano, recursos e ciclo de vida de uma empresa, na ficha do admin.
 *
 * Mostra o recurso EFETIVO, não só o que está marcado. A diferença importa:
 * uma exceção pode ligar algo que o plano não inclui, ou a regra antiga pode
 * dar tudo a um Essencial — e quem olha precisa ver o que o cliente de fato
 * tem, e por quê.
 */

type Assinatura = {
  plano: Plano;
  plataformaCompleta: boolean;
  status: "TRIAL" | "ACTIVE" | "PAUSED" | "CANCELED";
  amountCents: number;
  testeAte: string | null;
  setupCents: number | null;
  setupPagoEm: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
} | null;

type Excecao = { recurso: Recurso; ativo: boolean; motivo: string | null };

export function PlanoPanel({
  tenantId,
  assinatura,
  excecoes,
  onSalvo,
}: {
  tenantId: string;
  assinatura: Assinatura;
  excecoes: Excecao[];
  onSalvo: () => void;
}) {
  const [plano, setPlano] = useState<Plano>(assinatura?.plano ?? "ESSENCIAL");
  // Sem assinatura = empresa antiga = regra antiga. O padrão reflete isso.
  const [completa, setCompleta] = useState(assinatura ? assinatura.plataformaCompleta : true);
  const [ex, setEx] = useState<Record<Recurso, boolean | null>>(() => {
    const base = Object.fromEntries(TODOS_RECURSOS.map((r) => [r, null])) as Record<Recurso, boolean | null>;
    for (const e of excecoes) base[e.recurso] = e.ativo;
    return base;
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // O que valeria com a configuração que está na tela, antes de salvar.
  const efetivos = recursosEfetivos(
    { plano, plataformaCompleta: completa },
    TODOS_RECURSOS.filter((r) => ex[r] !== null).map((r) => ({ recurso: r, ativo: ex[r] as boolean }))
  );
  const doPlano = new Set(completa ? TODOS_RECURSOS : PLANOS[plano].recursos);

  function ciclar(r: Recurso) {
    // padrão → ligado → desligado → padrão. Três estados, porque "seguir o
    // plano" é diferente de "ligado": se o plano mudar depois, só o primeiro
    // acompanha a mudança.
    setEx((atual) => ({ ...atual, [r]: atual[r] === null ? true : atual[r] === true ? false : null }));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    const res = await fetch(`/api/admin/tenants/${tenantId}/plano`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plano,
        plataformaCompleta: completa,
        excecoes: TODOS_RECURSOS.map((r) => ({ recurso: r, ativo: ex[r] })),
      }),
    });
    setSalvando(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(typeof b.error === "string" ? b.error : "não deu pra salvar");
      return;
    }
    // Consequência que acontece no servidor e a pessoa precisa saber: o
    // menu de triagem que estava rodando pros clientes da empresa parou.
    if (b.uraDesligada) {
      setAviso("O menu de triagem saiu do plano e foi desligado. Os clientes desta empresa deixam de recebê-lo.");
    }
    onSalvo();
  }

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-medium text-neutral-200">Plano e recursos</h2>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-4 grid grid-cols-3 gap-2">
          {(Object.keys(PLANOS) as Plano[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlano(p)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                plano === p
                  ? "border-emerald-600 bg-emerald-950/40 text-emerald-200"
                  : "border-neutral-800 text-neutral-400 hover:border-neutral-700"
              }`}
            >
              <span className="block font-medium">{PLANOS[p].nome}</span>
              <span className="block text-xs opacity-75">
                {PLANOS[p].maxAtendentes === null ? "atendentes ilimitados" : `até ${PLANOS[p].maxAtendentes} atendentes`}
              </span>
            </button>
          ))}
        </div>

        <label className="mb-4 flex items-start gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={completa} onChange={(e) => setCompleta(e.target.checked)} className="mt-1" />
          <span>
            Plataforma completa (regra antiga)
            <span className="block text-xs text-neutral-500">
              Contratou quando todo plano incluía tudo. Recebe todos os recursos, qualquer que seja o
              plano. O limite de atendentes continua valendo pelo plano.
            </span>
          </span>
        </label>

        <p className="mb-2 text-xs text-neutral-500">
          Recursos — clique para ciclar entre seguir o plano, forçar ligado e forçar desligado.
        </p>
        <ul className="mb-4 flex flex-col gap-1.5">
          {TODOS_RECURSOS.map((r) => {
            const vale = efetivos.has(r);
            const estado = ex[r] === null ? "segue o plano" : ex[r] ? "ligado por exceção" : "desligado por exceção";
            return (
              <li key={r}>
                <button
                  type="button"
                  onClick={() => ciclar(r)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-neutral-800 px-3 py-2 text-left text-sm hover:border-neutral-700"
                >
                  <span className="text-neutral-200">{ROTULO_RECURSO[r]}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-neutral-500">{estado}</span>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-medium ${
                        vale
                          ? "border-emerald-900 bg-emerald-950/60 text-emerald-300"
                          : "border-neutral-700 text-neutral-500"
                      }`}
                    >
                      {vale ? "ativo" : "inativo"}
                    </span>
                    {/* Aponta quando a exceção contraria o plano: é o caso que
                        alguém vai querer entender daqui a seis meses. */}
                    {ex[r] !== null && ex[r] !== doPlano.has(r) && (
                      <span className="text-amber-400" title="Diferente do que o plano define">
                        ≠ plano
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {erro && <p className="mb-3 text-xs text-red-400">{erro}</p>}
        {aviso && <p className="mb-3 rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">{aviso}</p>}

        <button
          onClick={salvar}
          disabled={salvando}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:opacity-90 disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar plano"}
        </button>
      </div>
    </section>
  );
}
