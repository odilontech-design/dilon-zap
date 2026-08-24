"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatarReais, lerCentavos } from "@dilon-zap/esquadrias-core";
import type { StatusLancamento, TipoLancamento } from "@dilon-zap/erp-db";
import { Botao, Campo, Entrada, Selecao } from "@/components/campos";
import { Card, Etiqueta, Indicador, Tabela, TituloPagina, Vazio } from "@/components/ui";
import { buscar, enviar } from "@/lib/fetcher";

type Lancamento = {
  id: string;
  tipo: TipoLancamento;
  status: StatusLancamento;
  descricao: string;
  categoria: string | null;
  valorCentavos: number;
  vencimento: string;
  pagoEm: string | null;
  parcela: number | null;
  totalParcelas: number | null;
  cliente: { nome: string } | null;
  fornecedor: { nome: string } | null;
};

function primeiroDiaDoMes(offset = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

export function PainelFinanceiro() {
  const [de, setDe] = useState(primeiroDiaDoMes().toISOString().slice(0, 10));
  const [ate, setAte] = useState(new Date(primeiroDiaDoMes(1).getTime() - 86400000).toISOString().slice(0, 10));
  const [tipo, setTipo] = useState("");
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const query = new URLSearchParams({
    de: new Date(`${de}T00:00:00`).toISOString(),
    ate: new Date(`${ate}T23:59:59`).toISOString(),
    ...(tipo ? { tipo } : {}),
  }).toString();

  const { data, mutate, isLoading } = useSWR<Lancamento[]>(`/api/lancamentos?${query}`, buscar);

  const lancamentos = data ?? [];
  const somar = (filtro: (l: Lancamento) => boolean) => lancamentos.filter(filtro).reduce((a, l) => a + l.valorCentavos, 0);

  const receitas = somar((l) => l.tipo === "RECEITA" && l.status !== "CANCELADO");
  const despesas = somar((l) => l.tipo === "DESPESA" && l.status !== "CANCELADO");
  const recebido = somar((l) => l.tipo === "RECEITA" && l.status === "PAGO");
  const hoje = new Date();
  const vencidos = somar((l) => l.status === "PENDENTE" && new Date(l.vencimento) < hoje);

  async function acao(fn: () => Promise<unknown>) {
    setErro(null);
    try {
      await fn();
      mutate();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível concluir");
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Financeiro"
        descricao="Contas a receber e a pagar na mesma linha do tempo — o saldo do período é a diferença entre as duas."
        acao={<Botao onClick={() => setNovo((v) => !v)}>{novo ? "Fechar" : "Novo lançamento"}</Botao>}
      />

      {erro && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      {novo && <FormularioLancamento aoSalvar={(dados) => acao(async () => { await enviar("/api/lancamentos", "POST", dados); setNovo(false); })} />}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="A receber no período" valor={formatarReais(receitas)} detalhe={`${formatarReais(recebido)} já recebido`} tom="verde" />
        <Indicador rotulo="A pagar no período" valor={formatarReais(despesas)} />
        <Indicador rotulo="Saldo previsto" valor={formatarReais(receitas - despesas)} tom={receitas - despesas < 0 ? "vermelho" : "verde"} />
        <Indicador rotulo="Vencido em aberto" valor={formatarReais(vencidos)} tom={vencidos > 0 ? "vermelho" : "neutro"} />
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Campo rotulo="De">
          <Entrada type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </Campo>
        <Campo rotulo="Até">
          <Entrada type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </Campo>
        <Campo rotulo="Tipo">
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="RECEITA">Receitas</option>
            <option value="DESPESA">Despesas</option>
          </Selecao>
        </Campo>
      </div>

      <Card>
        {isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Carregando…</p>
        ) : lancamentos.length === 0 ? (
          <Vazio titulo="Nenhum lançamento no período" descricao="Aprovar um orçamento gera as parcelas automaticamente." />
        ) : (
          <Tabela cabecalho={["Vencimento", "Descrição", "Origem", "Valor", "Status", ""]}>
            {lancamentos.map((l) => {
              const atrasado = l.status === "PENDENTE" && new Date(l.vencimento) < hoje;
              return (
                <tr key={l.id}>
                  <td className="px-4 py-3 text-neutral-700">{new Date(l.vencimento).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-neutral-900">{l.descricao}</span>
                    {l.totalParcelas && l.totalParcelas > 1 && (
                      <span className="ml-2 text-xs text-neutral-500">
                        {l.parcela}/{l.totalParcelas}
                      </span>
                    )}
                    {l.categoria && <span className="block text-xs text-neutral-500">{l.categoria}</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{l.cliente?.nome ?? l.fornecedor?.nome ?? "—"}</td>
                  <td className={`px-4 py-3 font-medium ${l.tipo === "RECEITA" ? "text-emerald-600" : "text-red-600"}`}>
                    {l.tipo === "RECEITA" ? "+" : "−"} {formatarReais(l.valorCentavos)}
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta tom={l.status === "PAGO" ? "verde" : atrasado ? "vermelho" : "neutro"}>
                      {l.status === "PAGO" ? "pago" : atrasado ? "vencido" : "pendente"}
                    </Etiqueta>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {l.status === "PENDENTE" ? (
                      <button onClick={() => acao(() => enviar(`/api/lancamentos/${l.id}`, "PATCH", { status: "PAGO" }))} className="text-sm text-accent hover:underline">
                        dar baixa
                      </button>
                    ) : l.status === "PAGO" ? (
                      <button onClick={() => acao(() => enviar(`/api/lancamentos/${l.id}`, "PATCH", { status: "PENDENTE" }))} className="text-sm text-neutral-500 hover:underline">
                        estornar
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </Tabela>
        )}
      </Card>
    </>
  );
}

function FormularioLancamento({ aoSalvar }: { aoSalvar: (dados: Record<string, unknown>) => void }) {
  const [tipo, setTipo] = useState<TipoLancamento>("DESPESA");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(new Date().toISOString().slice(0, 10));

  return (
    <Card className="mb-4 p-4">
      <div className="grid gap-3 sm:grid-cols-5">
        <Campo rotulo="Tipo">
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoLancamento)}>
            <option value="DESPESA">Despesa</option>
            <option value="RECEITA">Receita</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Descrição" className="sm:col-span-2">
          <Entrada value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <Campo rotulo="Categoria">
          <Entrada value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Alumínio, ferro, folha, aluguel…" />
        </Campo>
        <Campo rotulo="Valor">
          <Entrada inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Vencimento">
          <Entrada type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </Campo>
      </div>

      <div className="mt-3 flex justify-end">
        <Botao
          disabled={descricao.trim().length < 2 || lerCentavos(valor) <= 0}
          onClick={() =>
            aoSalvar({
              tipo,
              descricao,
              categoria: categoria || null,
              valorCentavos: lerCentavos(valor),
              vencimento: new Date(`${vencimento}T12:00:00`).toISOString(),
            })
          }
        >
          Lançar
        </Botao>
      </div>
    </Card>
  );
}
