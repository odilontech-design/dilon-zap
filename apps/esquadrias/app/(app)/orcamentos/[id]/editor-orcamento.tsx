"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { formatarM2, formatarReais } from "@dilon-zap/esquadrias-core";
import type { StatusOrcamento } from "@dilon-zap/erp-db";
import { Botao, Campo, Entrada, EntradaMoeda, Selecao } from "@/components/campos";
import { Card, Etiqueta, Vazio, type Tom } from "@/components/ui";
import { buscar, enviar } from "@/lib/fetcher";
import { ModalItem, type CorOpcao, type ItemExistente, type TipologiaOpcao } from "./modal-item";

type Item = ItemExistente & {
  custoCentavos: number;
  subtotalCentavos: number;
  totalCentavos: number;
  memoriaCalculo: { expansao?: { areaTotalM2: number; pesoTotalKg: number }; erro?: string } | null;
  tipologia: { nome: string; desenhoSvg: string | null } | null;
  corAluminio: { nome: string; hex: string } | null;
};

type Orcamento = {
  id: string;
  numero: number;
  titulo: string;
  status: StatusOrcamento;
  clienteId: string | null;
  observacoes: string | null;
  condicoes: string | null;
  descontoPercent: number;
  descontoCentavos: number;
  descontoAplicadoCentavos: number;
  freteCentavos: number;
  subtotalCentavos: number;
  totalCentavos: number;
  custoCentavos: number;
  lucroCentavos: number;
  validoAte: string | null;
  itens: Item[];
};

const TOM: Record<StatusOrcamento, Tom> = {
  RASCUNHO: "neutro",
  ENVIADO: "azul",
  APROVADO: "verde",
  REPROVADO: "vermelho",
  EXPIRADO: "amarelo",
};

export function EditorOrcamento({
  orcamentoId,
  tipologias,
  cores,
  clientes,
  margemPadrao,
  mostrarCusto,
  temPlanoCorte,
  temFinanceiro,
}: {
  orcamentoId: string;
  tipologias: TipologiaOpcao[];
  cores: CorOpcao[];
  clientes: Array<{ id: string; nome: string }>;
  margemPadrao: number;
  mostrarCusto: boolean;
  temPlanoCorte: boolean;
  temFinanceiro: boolean;
}) {
  const router = useRouter();
  const { data, mutate, isLoading } = useSWR<Orcamento>(`/api/orcamentos/${orcamentoId}`, buscar);

  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState<Item | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [parcelas, setParcelas] = useState(1);

  if (isLoading || !data) return <p className="text-sm text-neutral-500">Carregando orçamento…</p>;

  const aprovado = data.status === "APROVADO";

  async function acao<T>(fn: () => Promise<T>) {
    setOcupado(true);
    setErro(null);
    try {
      await fn();
      await mutate();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível concluir");
    } finally {
      setOcupado(false);
    }
  }

  const margemEfetiva = data.totalCentavos > 0 ? ((data.lucroCentavos / data.totalCentavos) * 100).toFixed(1) : "0.0";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-neutral-900">
              #{data.numero} · {data.titulo}
            </h1>
            <Etiqueta tom={TOM[data.status]}>{data.status.toLowerCase()}</Etiqueta>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {data.itens.length} item(ns)
            {data.validoAte ? ` · válido até ${new Date(data.validoAte).toLocaleDateString("pt-BR")}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/orcamentos/${orcamentoId}/materiais`}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Relação de materiais
          </Link>
          <Link
            href={temPlanoCorte ? `/orcamentos/${orcamentoId}/corte` : "/upgrade?recurso=PLANO_CORTE"}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Plano de corte {temPlanoCorte ? "" : "🔒"}
          </Link>
          <Link
            href={`/orcamentos/${orcamentoId}/proposta`}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Proposta
          </Link>
          {!aprovado && (
            <Botao
              onClick={() =>
                acao(() => enviar(`/api/orcamentos/${orcamentoId}/status`, "POST", { status: "APROVADO", parcelas }))
              }
              disabled={ocupado || data.itens.length === 0}
            >
              Aprovar
            </Botao>
          )}
        </div>
      </div>

      {erro && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      {aprovado && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Orçamento aprovado — os valores estão congelados e a obra já foi criada. Reabrir o preço aqui mudaria o documento que o
          cliente aprovou.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h2 className="font-medium text-neutral-900">Itens</h2>
              {!aprovado && (
                <Botao
                  onClick={() => {
                    setItemEditando(null);
                    setModalAberto(true);
                  }}
                  disabled={tipologias.length === 0}
                >
                  Adicionar item
                </Botao>
              )}
            </div>

            {tipologias.length === 0 ? (
              <Vazio
                titulo="Nenhuma tipologia cadastrada"
                descricao="Cadastre ao menos uma tipologia — é ela que sabe transformar o vão em corte, vidro e ferragem."
                acao={
                  <Link href="/tipologias" className="text-sm text-accent hover:underline">
                    ir para tipologias
                  </Link>
                }
              />
            ) : data.itens.length === 0 ? (
              <Vazio titulo="Nenhum item" descricao="Adicione a primeira esquadria para ver custo, margem e preço." />
            ) : (
              <ul className="divide-y divide-neutral-200">
                {data.itens.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-start gap-4 px-4 py-4">
                    <div className="h-16 w-20 shrink-0 rounded-lg border border-neutral-200 p-1.5 text-neutral-400 [&_svg]:h-full [&_svg]:w-full">
                      {item.tipologia?.desenhoSvg ? (
                        <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: item.tipologia.desenhoSvg }} />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-neutral-900">{item.descricao}</p>
                      <p className="text-sm text-neutral-600">
                        {item.larguraMm} × {item.alturaMm} mm · {item.quantidade} un
                        {item.corAluminio ? ` · ${item.corAluminio.nome}` : ""}
                      </p>
                      {item.ambiente && <p className="text-xs text-neutral-500">{item.ambiente}</p>}
                      {item.memoriaCalculo?.erro && (
                        <p className="mt-1 text-xs text-red-600">Erro no cálculo: {item.memoriaCalculo.erro}</p>
                      )}
                      {item.memoriaCalculo?.expansao && (
                        <p className="mt-1 text-xs text-neutral-500">
                          {formatarM2(item.memoriaCalculo.expansao.areaTotalM2)} · {item.memoriaCalculo.expansao.pesoTotalKg.toFixed(2)} kg de perfil
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      {mostrarCusto && <p className="text-xs text-neutral-500">custo {formatarReais(item.custoCentavos)}</p>}
                      <p className="font-semibold text-neutral-900">{formatarReais(item.totalCentavos)}</p>
                      {!aprovado && (
                        <div className="mt-1 flex justify-end gap-2 text-xs">
                          <button
                            onClick={() => {
                              setItemEditando(item);
                              setModalAberto(true);
                            }}
                            className="text-accent hover:underline"
                          >
                            editar
                          </button>
                          <button
                            onClick={() => acao(() => enviar(`/api/orcamentos/${orcamentoId}/itens/${item.id}`, "DELETE"))}
                            className="text-red-600 hover:underline"
                          >
                            remover
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h2 className="font-medium text-neutral-900">Dados</h2>

            <Campo rotulo="Título">
              <Entrada
                defaultValue={data.titulo}
                disabled={aprovado}
                onBlur={(e) => e.target.value !== data.titulo && acao(() => enviar(`/api/orcamentos/${orcamentoId}`, "PATCH", { titulo: e.target.value }))}
              />
            </Campo>

            <Campo rotulo="Cliente">
              <Selecao
                value={data.clienteId ?? ""}
                disabled={aprovado}
                onChange={(e) => acao(() => enviar(`/api/orcamentos/${orcamentoId}`, "PATCH", { clienteId: e.target.value || null }))}
              >
                <option value="">Sem cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </Card>

          <Card className="p-4 space-y-3">
            <h2 className="font-medium text-neutral-900">Totais</h2>

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Soma dos itens</dt>
                <dd className="text-neutral-700">{formatarReais(data.subtotalCentavos)}</dd>
              </div>
              {mostrarCusto && (
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Custo</dt>
                  <dd className="text-neutral-700">{formatarReais(data.custoCentavos)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-neutral-500">Desconto</dt>
                <dd className="text-neutral-700">− {formatarReais(data.descontoAplicadoCentavos)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Frete / instalação</dt>
                <dd className="text-neutral-700">{formatarReais(data.freteCentavos)}</dd>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-1.5 text-base">
                <dt className="font-semibold text-neutral-900">Total</dt>
                <dd className="font-semibold text-neutral-900">{formatarReais(data.totalCentavos)}</dd>
              </div>
            </dl>

            {mostrarCusto && (
              // A margem efetiva fica ao lado do desconto de propósito: é o
              // número que mostra, na hora, o que "dar 10%" fez com o lucro.
              <p className={`text-xs ${Number(margemEfetiva) < 15 ? "text-red-600" : "text-neutral-500"}`}>
                Margem efetiva: {margemEfetiva}% · lucro de {formatarReais(data.lucroCentavos)}
              </p>
            )}

            {!aprovado && (
              <div className="grid gap-3 border-t border-neutral-200 pt-3 sm:grid-cols-2">
                <Campo rotulo="Desconto (%)">
                  <Entrada
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    defaultValue={data.descontoPercent}
                    onBlur={(e) => acao(() => enviar(`/api/orcamentos/${orcamentoId}`, "PATCH", { descontoPercent: Number(e.target.value) || 0 }))}
                  />
                </Campo>
                <Campo rotulo="Frete">
                  <EntradaMoeda
                    valorCentavos={data.freteCentavos}
                    onChange={(centavos) => acao(() => enviar(`/api/orcamentos/${orcamentoId}`, "PATCH", { freteCentavos: centavos }))}
                  />
                </Campo>
              </div>
            )}
          </Card>

          {!aprovado && temFinanceiro && (
            <Card className="p-4">
              <Campo rotulo="Parcelas ao aprovar" ajuda="Gera as contas a receber com vencimento mensal.">
                <Entrada type="number" min={1} max={36} value={parcelas} onChange={(e) => setParcelas(Math.max(1, Number(e.target.value) || 1))} />
              </Campo>
            </Card>
          )}
        </div>
      </div>

      {modalAberto && (
        <ModalItem
          orcamentoId={orcamentoId}
          tipologias={tipologias}
          cores={cores}
          margemPadrao={margemPadrao}
          item={itemEditando}
          mostrarCusto={mostrarCusto}
          aoFechar={() => setModalAberto(false)}
          aoSalvar={() => {
            setModalAberto(false);
            mutate();
            router.refresh();
          }}
        />
      )}
    </>
  );
}
