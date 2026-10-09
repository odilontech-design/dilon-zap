"use client";

import { useState } from "react";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { reaisParaCentavos } from "../funil/tipos";
import { chamar, dataHoraBR, fetcher, ROTULO_MEIO } from "../receber/formatos";

const ROTULO_FORMA: Record<string, string> = { BOLETO: "Boleto", PIX: "PIX", TRANSFERENCIA: "Transferência", CARTAO: "Cartão", DINHEIRO: "Dinheiro", CHEQUE: "Cheque", OUTRO: "Outro" };

type Resumo = {
  porMeio: Record<string, number>;
  totalRecebidoCents: number;
  recebidoDinheiroCents: number;
  suprimentosCents: number;
  sangriasCents: number;
  despesasCents: number;
  pagamentosAFornecedoresCents: number;
  esperadoDinheiroCents: number;
};

type Dados = {
  caixa: {
    id: string;
    abertoEm: string;
    abertoPor: string | null;
    valorInicialCents: number;
    fechadoEm: string | null;
    fechadoPor: string | null;
    esperadoDinheiroCents: number | null;
    contadoDinheiroCents: number | null;
    diferencaCents: number | null;
    observacao: string | null;
  };
  resumo: Resumo;
  recebimentos: { id: string; valorCents: number; meio: string | null; lancadoEm: string; cliente: string; referencia: string; parcela: string | null; observacao: string | null; por: string | null }[];
  pagamentosAFornecedores: { id: string; valorCents: number; meio: string | null; lancadoEm: string; fornecedor: string; referencia: string; parcela: string | null; observacao: string | null; por: string | null }[];
  movimentos: { id: string; tipo: "SUPRIMENTO" | "SANGRIA" | "DESPESA"; valorCents: number; descricao: string; createdAt: string; createdBy: { name: string } | null }[];
};

type Historico = {
  id: string;
  abertoEm: string;
  fechadoEm: string | null;
  abertoPor: string | null;
  fechadoPor: string | null;
  valorInicialCents: number;
  esperadoDinheiroCents: number | null;
  contadoDinheiroCents: number | null;
  diferencaCents: number | null;
};

const ROTULO_MOV = { SUPRIMENTO: "Suprimento", SANGRIA: "Sangria", DESPESA: "Despesa" } as const;

function Cartao({ titulo, valor, nota, destaque }: { titulo: string; valor: string; nota?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 min-w-[160px] ${destaque ? "border-accent/40 bg-accent/10" : "border-neutral-200 bg-surface"}`}>
      <p className="text-[11px] text-neutral-500">{titulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-[11px] text-neutral-400">{nota}</p>}
    </div>
  );
}

/** Texto e cor da diferença: sempre com palavra, nunca só a cor. */
function Diferenca({ cents }: { cents: number | null }) {
  if (cents === null) return <span className="text-neutral-400">—</span>;
  if (cents === 0) return <span className="text-green-700 font-medium">Confere</span>;
  return (
    <span className={`font-medium ${cents < 0 ? "text-red-600" : "text-amber-700"}`}>
      {cents < 0 ? "Faltou " : "Sobrou "}
      {centsToBRL(Math.abs(cents))}
    </span>
  );
}

export function CaixaPanel() {
  const { data, error, mutate } = useSWR<{ atual: Dados | null; historico: Historico[] }>("/api/caixa", fetcher, { refreshInterval: 20_000 });
  const [verId, setVerId] = useState<string | null>(null);
  const [valorInicial, setValorInicial] = useState("");
  const [movimento, setMovimento] = useState<"SUPRIMENTO" | "SANGRIA" | "DESPESA" | null>(null);
  const [fechando, setFechando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    const cents = valorInicial.trim() ? reaisParaCentavos(valorInicial) : 0;
    if (cents === null) return setErro("valor inicial inválido");
    setErro(null);
    const r = await chamar("/api/caixa", "POST", { valorInicialCents: cents });
    if (!r.ok) return setErro(r.erro ?? "não deu pra abrir o caixa");
    setValorInicial("");
    mutate();
  }

  const atual = data.atual;
  const campo = "rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div className="flex flex-col gap-6">
      {!atual ? (
        <form onSubmit={abrir} className="rounded-lg border border-neutral-200 bg-surface p-5 max-w-lg">
          <h2 className="text-base font-semibold mb-1">Caixa fechado</h2>
          <p className="text-sm text-neutral-600 mb-4">
            Abra o caixa com o dinheiro que já está na gaveta. Tudo o que for recebido a partir de agora cai nele sozinho.
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="text-xs font-medium text-neutral-700">
              Valor inicial em dinheiro (R$)
              <input value={valorInicial} onChange={(e) => setValorInicial(e.target.value)} inputMode="decimal" placeholder="0,00" className={`${campo} block mt-1 w-44`} />
            </label>
            <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Abrir caixa
            </button>
          </div>
          {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}
        </form>
      ) : (
        <DetalheDoCaixa
          dados={atual}
          aberto
          onMovimento={setMovimento}
          onFechar={() => setFechando(true)}
        />
      )}

      <div>
        <h2 className="text-base font-semibold mb-3">Caixas anteriores</h2>
        <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Abertura</th>
                <th className="text-left px-3 py-2 font-medium">Fechamento</th>
                <th className="text-left px-3 py-2 font-medium">Operador</th>
                <th className="text-right px-3 py-2 font-medium">Inicial</th>
                <th className="text-right px-3 py-2 font-medium">Esperado</th>
                <th className="text-right px-3 py-2 font-medium">Contado</th>
                <th className="text-left px-3 py-2 font-medium">Diferença</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.historico.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                    Nenhum caixa fechado ainda.
                  </td>
                </tr>
              )}
              {data.historico.map((h) => (
                <tr key={h.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2.5">{dataHoraBR(h.abertoEm)}</td>
                  <td className="px-3 py-2.5">{dataHoraBR(h.fechadoEm)}</td>
                  <td className="px-3 py-2.5">{h.fechadoPor ?? h.abertoPor ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right">{centsToBRL(h.valorInicialCents)}</td>
                  <td className="px-3 py-2.5 text-right">{h.esperadoDinheiroCents === null ? "—" : centsToBRL(h.esperadoDinheiroCents)}</td>
                  <td className="px-3 py-2.5 text-right">{h.contadoDinheiroCents === null ? "—" : centsToBRL(h.contadoDinheiroCents)}</td>
                  <td className="px-3 py-2.5">
                    <Diferenca cents={h.diferencaCents} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => setVerId(h.id)} className="text-xs text-neutral-500 hover:text-accent">
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {movimento && atual && (
        <MovimentoModal
          caixaId={atual.caixa.id}
          tipo={movimento}
          onFechar={() => setMovimento(null)}
          onFeito={() => {
            setMovimento(null);
            mutate();
          }}
        />
      )}
      {fechando && atual && (
        <FecharModal
          dados={atual}
          onFechar={() => setFechando(false)}
          onFechado={() => {
            setFechando(false);
            mutate();
          }}
        />
      )}
      {verId && <VerCaixa id={verId} onFechar={() => setVerId(null)} />}
    </div>
  );
}

function DetalheDoCaixa({
  dados,
  aberto,
  onMovimento,
  onFechar,
}: {
  dados: Dados;
  aberto: boolean;
  onMovimento?: (t: "SUPRIMENTO" | "SANGRIA" | "DESPESA") => void;
  onFechar?: () => void;
}) {
  const r = dados.resumo;
  const meios = Object.entries(r.porMeio).filter(([, v]) => v !== 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">{aberto ? "Caixa aberto" : "Caixa fechado"}</h2>
          <p className="text-xs text-neutral-500">
            Aberto em {dataHoraBR(dados.caixa.abertoEm)}
            {dados.caixa.abertoPor && ` por ${dados.caixa.abertoPor}`}
            {dados.caixa.fechadoEm && ` · fechado em ${dataHoraBR(dados.caixa.fechadoEm)}`}
          </p>
        </div>
        {aberto && onMovimento && onFechar && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => onMovimento("SUPRIMENTO")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              + Suprimento
            </button>
            <button onClick={() => onMovimento("SANGRIA")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              − Sangria
            </button>
            <button onClick={() => onMovimento("DESPESA")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              − Despesa
            </button>
            <button onClick={onFechar} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Fechar caixa
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Cartao titulo="Valor inicial" valor={centsToBRL(dados.caixa.valorInicialCents)} />
        <Cartao titulo="Recebido na sessão" valor={centsToBRL(r.totalRecebidoCents)} nota="todas as formas" />
        <Cartao titulo="Dinheiro esperado na gaveta" valor={centsToBRL(r.esperadoDinheiroCents)} nota="inicial + dinheiro + suprimentos − sangrias − despesas − pagamentos em dinheiro" destaque />
        {dados.caixa.fechadoEm && (
          <>
            <Cartao titulo="Contado" valor={dados.caixa.contadoDinheiroCents === null ? "—" : centsToBRL(dados.caixa.contadoDinheiroCents)} />
            <div className="rounded-lg border border-neutral-200 bg-surface px-4 py-3 min-w-[160px]">
              <p className="text-[11px] text-neutral-500">Diferença</p>
              <p className="text-lg tabular-nums">
                <Diferenca cents={dados.caixa.diferencaCents} />
              </p>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-surface p-4">
          <h3 className="text-sm font-semibold mb-3">Por forma de pagamento</h3>
          {meios.length === 0 ? (
            <p className="text-xs text-neutral-400">Nenhum recebimento nesta sessão.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm tabular-nums">
              {meios.map(([meio, valor]) => (
                <li key={meio} className="flex justify-between">
                  <span>{meio === "OUTRO" ? "Sem forma informada" : (ROTULO_MEIO[meio] ?? meio)}</span>
                  <span>{centsToBRL(valor)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-neutral-400 mt-3">Só o dinheiro é conferido na gaveta; PIX, cartão e boleto não passam por ela.</p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-surface p-4">
          <h3 className="text-sm font-semibold mb-3">Movimentos do caixa</h3>
          {dados.movimentos.length === 0 ? (
            <p className="text-xs text-neutral-400">Nenhum suprimento, sangria ou despesa.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm tabular-nums">
              {dados.movimentos.map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {ROTULO_MOV[m.tipo]} · {m.descricao}
                  </span>
                  <span className={`shrink-0 ${m.tipo === "SUPRIMENTO" ? "text-green-700" : "text-red-600"}`}>
                    {m.tipo === "SUPRIMENTO" ? "+" : "−"} {centsToBRL(m.valorCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Lançado em</th>
              <th className="text-left px-3 py-2 font-medium">Cliente</th>
              <th className="text-left px-3 py-2 font-medium">Referência</th>
              <th className="text-left px-3 py-2 font-medium">Forma</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {dados.recebimentos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Nada recebido nesta sessão.
                </td>
              </tr>
            )}
            {dados.recebimentos.map((x) => (
              <tr key={x.id} className="border-t border-neutral-100">
                <td className="px-4 py-2.5">{dataHoraBR(x.lancadoEm)}</td>
                <td className="px-3 py-2.5">{x.cliente}</td>
                <td className="px-3 py-2.5">
                  {x.referencia}
                  {x.parcela && <span className="text-neutral-400"> · parcela {x.parcela}</span>}
                  {x.valorCents < 0 && <span className="text-red-600"> · estorno</span>}
                </td>
                <td className="px-3 py-2.5">{x.meio ? (ROTULO_MEIO[x.meio] ?? x.meio) : "—"}</td>
                <td className={`px-3 py-2.5 text-right ${x.valorCents < 0 ? "text-red-600" : ""}`}>{centsToBRL(x.valorCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dados.pagamentosAFornecedores.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
          <h3 className="text-sm font-semibold px-4 pt-3">Pagamentos a fornecedores na sessão</h3>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Lançado em</th>
                <th className="text-left px-3 py-2 font-medium">Fornecedor</th>
                <th className="text-left px-3 py-2 font-medium">Referência</th>
                <th className="text-left px-3 py-2 font-medium">Forma</th>
                <th className="text-right px-3 py-2 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {dados.pagamentosAFornecedores.map((x) => (
                <tr key={x.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2.5">{dataHoraBR(x.lancadoEm)}</td>
                  <td className="px-3 py-2.5">{x.fornecedor}</td>
                  <td className="px-3 py-2.5">
                    {x.referencia}
                    {x.parcela && <span className="text-neutral-400"> · parcela {x.parcela}</span>}
                    {x.valorCents < 0 && <span className="text-red-600"> · estorno</span>}
                  </td>
                  <td className="px-3 py-2.5">{x.meio ? (ROTULO_FORMA[x.meio] ?? x.meio) : "—"}</td>
                  <td className={`px-3 py-2.5 text-right ${x.valorCents < 0 ? "text-green-700" : "text-red-600"}`}>{centsToBRL(x.valorCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-neutral-400 px-4 pb-3">Só os pagamentos em dinheiro saem da gaveta.</p>
        </div>
      )}
    </div>
  );
}

function VerCaixa({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { data, error } = useSWR<Dados>(`/api/caixa/${id}`, fetcher);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onFechar}>
      <aside className="bg-surface w-full max-w-4xl h-full overflow-y-auto shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end mb-2">
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-lg leading-none" aria-label="Fechar">
            ×
          </button>
        </div>
        {error ? <p className="text-sm text-red-600">{error.message}</p> : !data ? <p className="text-sm text-neutral-400">Carregando...</p> : <DetalheDoCaixa dados={data} aberto={false} />}
      </aside>
    </div>
  );
}

function MovimentoModal({ caixaId, tipo, onFechar, onFeito }: { caixaId: string; tipo: "SUPRIMENTO" | "SANGRIA" | "DESPESA"; onFechar: () => void; onFeito: () => void }) {
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const cents = reaisParaCentavos(valor);
    if (cents === null || cents <= 0) return setErro("informe um valor válido");
    if (!descricao.trim()) return setErro("descreva o movimento");
    setErro(null);
    setSalvando(true);
    const r = await chamar(`/api/caixa/${caixaId}`, "POST", { acao: "movimento", tipo, valorCents: cents, descricao: descricao.trim() });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra registrar");
    onFeito();
  }

  const dica = {
    SUPRIMENTO: "Dinheiro que entrou no caixa e não é venda: troco, reforço.",
    SANGRIA: "Dinheiro que saiu do caixa para o cofre ou o banco.",
    DESPESA: "Dinheiro que saiu do caixa para pagar algo.",
  }[tipo];
  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-1">{ROTULO_MOV[tipo]}</h2>
        <p className="text-xs text-neutral-500 mb-4">{dica}</p>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Valor (R$)
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" autoFocus className={`${campo} mt-1`} />
          </label>
          <label className="text-xs font-medium text-neutral-700">
            Descrição
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={`${campo} mt-1`} />
          </label>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Registrar
          </button>
        </div>
      </form>
    </div>
  );
}

function FecharModal({ dados, onFechar, onFechado }: { dados: Dados; onFechar: () => void; onFechado: () => void }) {
  const [contado, setContado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const contadoCents = contado.trim() ? reaisParaCentavos(contado) : null;
  const esperado = dados.resumo.esperadoDinheiroCents;
  const diferenca = contadoCents === null ? null : contadoCents - esperado;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (contadoCents === null) return setErro("informe o dinheiro contado na gaveta");
    if (diferenca !== 0 && !observacao.trim() && !confirm("Há diferença no caixa e nenhuma observação. Fechar mesmo assim?")) return;
    setErro(null);
    setSalvando(true);
    const r = await chamar(`/api/caixa/${dados.caixa.id}`, "POST", { acao: "fechar", contadoDinheiroCents: contadoCents, observacao: observacao.trim() || null });
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra fechar");
    onFechado();
  }

  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-1">Fechar caixa</h2>
        <p className="text-xs text-neutral-500 mb-4">Conte o dinheiro da gaveta e informe abaixo. O sistema compara com o que era esperado.</p>
        <div className="rounded-md bg-neutral-50 px-3 py-2 mb-3 flex justify-between text-sm tabular-nums">
          <span className="text-neutral-600">Esperado em dinheiro</span>
          <b>{centsToBRL(esperado)}</b>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-neutral-700">
            Dinheiro contado (R$)
            <input value={contado} onChange={(e) => setContado(e.target.value)} inputMode="decimal" autoFocus className={`${campo} mt-1`} />
          </label>
          {diferenca !== null && (
            <p className="text-sm">
              Diferença: <Diferenca cents={diferenca} />
            </p>
          )}
          <label className="text-xs font-medium text-neutral-700">
            Observação (opcional)
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={`${campo} mt-1`} />
          </label>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Fechar caixa
          </button>
        </div>
      </form>
    </div>
  );
}
