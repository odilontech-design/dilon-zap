"use client";

import Link from "next/link";
import useSWR from "swr";
import { formatarReais } from "@dilon-zap/esquadrias-core";
import type { StatusObra } from "@dilon-zap/erp-db";
import { Card, TituloPagina, Vazio } from "@/components/ui";
import { buscar, enviar } from "@/lib/fetcher";

type Obra = {
  id: string;
  titulo: string;
  status: StatusObra;
  valorCentavos: number;
  previsaoFim: string | null;
  cliente: { id: string; nome: string; telefone: string | null } | null;
  responsavel: { id: string; nome: string } | null;
  orcamento: { id: string; numero: number } | null;
};

/**
 * As etapas em ordem de fluxo, e não em ordem alfabética: o quadro é lido da
 * esquerda pra direita como a obra anda de verdade na serralheria.
 */
const ETAPAS: Array<{ status: StatusObra; rotulo: string }> = [
  { status: "AGUARDANDO", rotulo: "Aguardando" },
  { status: "MEDICAO", rotulo: "Medição" },
  { status: "PRODUCAO", rotulo: "Produção" },
  { status: "PRONTO", rotulo: "Pronto" },
  { status: "INSTALACAO", rotulo: "Instalação" },
  { status: "CONCLUIDA", rotulo: "Concluída" },
];

export function PainelObras() {
  const { data, mutate, isLoading } = useSWR<Obra[]>("/api/obras", buscar);

  async function mover(obra: Obra, direcao: 1 | -1) {
    const indice = ETAPAS.findIndex((e) => e.status === obra.status);
    const destino = ETAPAS[indice + direcao];
    if (!destino) return;
    await enviar(`/api/obras/${obra.id}`, "PATCH", { status: destino.status });
    mutate();
  }

  const abertas = (data ?? []).filter((o) => o.status !== "CANCELADA");

  return (
    <>
      <TituloPagina
        titulo="Obras e serviços"
        descricao="Cada orçamento aprovado vira uma obra aqui. Arraste a etapa conforme a esquadria anda na produção."
      />

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : abertas.length === 0 ? (
        <Card>
          <Vazio titulo="Nenhuma obra" descricao="Aprove um orçamento e a obra aparece aqui automaticamente." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ETAPAS.map((etapa) => {
            const daEtapa = abertas.filter((o) => o.status === etapa.status);
            if (daEtapa.length === 0) return null;

            return (
              <div key={etapa.status}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="font-medium text-neutral-900">{etapa.rotulo}</h2>
                  <span className="text-xs text-neutral-500">
                    {daEtapa.length} · {formatarReais(daEtapa.reduce((a, o) => a + o.valorCentavos, 0))}
                  </span>
                </div>

                <ul className="space-y-2">
                  {daEtapa.map((obra) => (
                    <li key={obra.id}>
                      <Card className="p-3">
                        <p className="font-medium text-neutral-900">{obra.titulo}</p>
                        <p className="text-sm text-neutral-600">{obra.cliente?.nome ?? "sem cliente"}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {formatarReais(obra.valorCentavos)}
                          {obra.responsavel ? ` · ${obra.responsavel.nome}` : ""}
                        </p>

                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-neutral-200 pt-2 text-xs">
                          {obra.orcamento ? (
                            <Link href={`/orcamentos/${obra.orcamento.id}`} className="text-accent hover:underline">
                              orçamento #{obra.orcamento.numero}
                            </Link>
                          ) : (
                            <span className="text-neutral-400">sem orçamento</span>
                          )}

                          <span className="flex gap-2">
                            <button onClick={() => mover(obra, -1)} className="text-neutral-600 hover:underline">
                              ← voltar
                            </button>
                            <button onClick={() => mover(obra, 1)} className="text-accent hover:underline">
                              avançar →
                            </button>
                          </span>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
