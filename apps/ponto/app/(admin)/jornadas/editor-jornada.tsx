"use client";

import { useState, useTransition } from "react";
import { Botao, Campo, Entrada } from "@/components/campos";
import { DIAS_SEMANA, type Semana } from "@/lib/jornada";
import { excluirJornada, salvarJornada } from "./acoes";

type Linha = { a1: string; b1: string; a2: string; b2: string };

const PADRAO: Linha[] = [0, 1, 2, 3, 4, 5, 6].map((d) =>
  d >= 1 && d <= 5 ? { a1: "08:00", b1: "12:00", a2: "13:00", b2: "17:00" } : { a1: "", b1: "", a2: "", b2: "" },
);

function deSemana(s: Semana): Linha[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const p = s[String(d)] ?? [];
    return { a1: p[0]?.[0] ?? "", b1: p[0]?.[1] ?? "", a2: p[1]?.[0] ?? "", b2: p[1]?.[1] ?? "" };
  });
}

function paraSemana(linhas: Linha[]): Semana {
  const s: Semana = {};
  linhas.forEach((l, d) => {
    const p: Array<[string, string]> = [];
    if (l.a1 && l.b1) p.push([l.a1, l.b1]);
    if (l.a2 && l.b2) p.push([l.a2, l.b2]);
    s[String(d)] = p;
  });
  return s;
}

export function EditorJornada({ jornada }: { jornada?: { id: string; nome: string; semana: Semana } }) {
  const [aberto, setAberto] = useState(!jornada);
  const [nome, setNome] = useState(jornada?.nome ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(jornada ? deSemana(jornada.semana) : PADRAO);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const muda = (d: number, k: keyof Linha, v: string) => setLinhas(linhas.map((l, i) => (i === d ? { ...l, [k]: v } : l)));

  function copiarSegunda() {
    setLinhas(linhas.map((l, i) => (i >= 2 && i <= 5 ? { ...linhas[1] } : l)));
  }

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await salvarJornada({ id: jornada?.id, nome, semana: paraSemana(linhas) });
      if (!r.ok) return setErro(r.erro);
      if (jornada) setAberto(false);
      else {
        setNome("");
        setLinhas(PADRAO);
      }
    });
  }

  if (!aberto) {
    return (
      <Botao variante="secundario" onClick={() => setAberto(true)}>
        Editar
      </Botao>
    );
  }

  return (
    <div className="w-full space-y-3">
      <Campo rotulo="Nome da jornada">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Comercial seg–sex" />
      </Campo>
      {/* No celular, cada dia vira duas linhas (manhã e tarde); da tablet em
          diante, uma linha com as quatro marcações. */}
      <div className="space-y-3 sm:space-y-1.5">
        <div className="hidden sm:grid sm:grid-cols-[6rem_repeat(4,7rem)] gap-2 text-xs text-neutral-500">
          <span>Dia</span>
          <span>Entrada</span>
          <span>Saída</span>
          <span>Volta</span>
          <span>Saída</span>
        </div>
        {linhas.map((l, d) => (
          <div key={d} className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_repeat(4,7rem)] sm:items-center">
            <p className="col-span-2 sm:col-span-1 text-sm font-medium sm:font-normal text-neutral-700">{DIAS_SEMANA[d]}</p>
            {(["a1", "b1", "a2", "b2"] as const).map((k) => (
              <Entrada
                key={k}
                type="time"
                aria-label={`${DIAS_SEMANA[d]}: ${{ a1: "entrada", b1: "saída", a2: "volta", b2: "saída final" }[k]}`}
                value={l[k]}
                onChange={(e) => muda(d, k, e.target.value)}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">Dia em branco é folga. Deixe a segunda parte vazia se não houver intervalo registrado.</p>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Botao onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar jornada"}
        </Botao>
        <Botao variante="secundario" onClick={copiarSegunda}>
          Copiar segunda para ter–sex
        </Botao>
        {jornada && (
          <>
            <Botao variante="secundario" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              disabled={pendente}
              onClick={() =>
                confirm("Excluir esta jornada?") &&
                iniciar(async () => {
                  const r = await excluirJornada(jornada.id);
                  if (!r.ok) setErro(r.erro);
                })
              }
            >
              Excluir
            </Botao>
          </>
        )}
      </div>
    </div>
  );
}
