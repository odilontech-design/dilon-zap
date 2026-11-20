"use client";

import { useState, useTransition } from "react";
import type { DiaEspelho } from "@/lib/calculo";
import { abonar, desconsiderarMarcacao, desfazerAbono, desfazerTratamento, incluirMarcacao } from "@/lib/acoes-ponto";
import type { Resultado } from "@/lib/acoes";
import { dataCurta } from "@/lib/datas";
import { Botao, Entrada, Selecao } from "@/components/campos";

const MOTIVOS = [
  "Esqueceu de registrar",
  "Registro em duplicidade",
  "Registrou no horário errado",
  "Serviço externo",
  "Atestado médico",
  "Consulta médica",
  "Folga compensatória",
  "Outro",
];

function hhmmParaMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function AjustesDia({ colaboradorId, dia }: { colaboradorId: string; dia: DiaEspelho }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [detalhe, setDetalhe] = useState("");
  const [hora, setHora] = useState("");
  const [diaSeguinte, setDiaSeguinte] = useState(false);
  const debito = dia.apuracao?.debitoMin ?? 0;
  const [abono, setAbono] = useState(debito ? `${String(Math.floor(debito / 60)).padStart(2, "0")}:${String(debito % 60).padStart(2, "0")}` : "");

  const textoMotivo = motivo === "Outro" ? detalhe : detalhe ? `${motivo}: ${detalhe}` : motivo;

  function executar(fn: () => Promise<Resultado>) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.erro);
      else setHora("");
    });
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="text-xs text-accent hover:underline whitespace-nowrap">
        Ajustar
      </button>
    );
  }

  return (
    <div className="fixed right-4 top-4 z-30 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto space-y-3 rounded-xl border border-neutral-300 bg-surface p-4 shadow-xl text-xs">
      <div className="flex items-center justify-between">
        <p className="font-medium text-neutral-900 text-sm">Ajustes de {dataCurta(dia.data)}</p>
        <button onClick={() => setAberto(false)} className="text-neutral-500">
          fechar
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-neutral-500">Motivo (obrigatório, fica no espelho)</p>
        <Selecao value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {MOTIVOS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Selecao>
        <Entrada placeholder={motivo === "Outro" ? "Descreva o motivo" : "Detalhe (opcional)"} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <p className="text-neutral-500">Incluir marcação que faltou</p>
        <div className="flex items-center gap-2">
          <Entrada type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="w-28" />
          <label className="flex items-center gap-1 text-neutral-600">
            <input type="checkbox" checked={diaSeguinte} onChange={(e) => setDiaSeguinte(e.target.checked)} /> dia seguinte
          </label>
        </div>
        <Botao
          variante="secundario"
          disabled={pendente || !hora}
          className="w-full py-1.5 text-xs"
          onClick={() => executar(() => incluirMarcacao({ colaboradorId, data: dia.data, hora, diaSeguinte, motivo: textoMotivo }))}
        >
          Incluir {hora || "horário"}
        </Botao>
      </div>

      {dia.marcacoes.length > 0 && (
        <div className="space-y-1">
          <p className="text-neutral-500">Marcações do dia</p>
          {dia.marcacoes.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2">
              <span className={`tabular-nums ${m.desconsiderada ? "line-through text-neutral-400" : ""}`}>
                {m.hora}
                {m.diaSeguinte ? " (+1)" : ""} {m.origem === "INCLUSAO" ? "· incluída" : `· NSR ${m.nsr}`}
              </span>
              {m.origem === "INCLUSAO" ? (
                <button disabled={pendente} onClick={() => executar(() => desfazerTratamento(m.id))} className="text-red-600">
                  desfazer
                </button>
              ) : m.desconsiderada ? (
                <button disabled={pendente} onClick={() => executar(() => desfazerTratamento(m.desconsiderada!.tratamentoId))} className="text-accent">
                  voltar a considerar
                </button>
              ) : (
                <button disabled={pendente} onClick={() => executar(() => desconsiderarMarcacao({ marcacaoId: m.id, motivo: textoMotivo }))} className="text-red-600">
                  desconsiderar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-neutral-500">Abonar horas (atestado, consulta)</p>
        <div className="flex items-center gap-2">
          <Entrada type="time" value={abono} onChange={(e) => setAbono(e.target.value)} className="w-28" />
          <Botao
            variante="secundario"
            disabled={pendente || !abono || hhmmParaMin(abono) === 0}
            className="py-1.5 text-xs"
            onClick={() => executar(() => abonar({ colaboradorId, data: dia.data, minutos: hhmmParaMin(abono), motivo: textoMotivo }))}
          >
            Abonar
          </Botao>
        </div>
        {dia.abonos.map((a) => (
          <div key={a.id} className="flex justify-between">
            <span>
              {Math.floor(a.minutos / 60)}h{String(a.minutos % 60).padStart(2, "0")} · {a.motivo}
            </span>
            <button disabled={pendente} onClick={() => executar(() => desfazerAbono(a.id))} className="text-red-600">
              desfazer
            </button>
          </div>
        ))}
      </div>

      {erro && <p className="text-red-600">{erro}</p>}
      {pendente && <p className="text-neutral-500">Salvando…</p>}
    </div>
  );
}
