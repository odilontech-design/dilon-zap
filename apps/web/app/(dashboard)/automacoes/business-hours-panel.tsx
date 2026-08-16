"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

type Dia = { weekday: number; isOpen: boolean; opensAt: string; closesAt: string };
type Config = {
  timezone: string;
  outOfHoursMessage: string | null;
  days: Dia[];
  configurado: boolean;
};

const NOMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function BusinessHoursPanel({ podeEditar }: { podeEditar: boolean }) {
  const { data, mutate } = useSWR<Config>("/api/business-hours", fetcher);
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  // A semana é editada como rascunho local e só vai pro servidor no "Salvar":
  // salvar dia a dia deixaria o atendimento meio-configurado entre uma
  // requisição e outra, e o worker já estaria lendo isso.
  useEffect(() => {
    if (data && dias === null) {
      setDias(data.days);
      setMensagem(data.outOfHoursMessage ?? "");
    }
  }, [data, dias]);

  function altera(weekday: number, mudanca: Partial<Dia>) {
    setSalvo(false);
    setDias((atual) => atual?.map((d) => (d.weekday === weekday ? { ...d, ...mudanca } : d)) ?? null);
  }

  async function salvar() {
    if (!dias) return;
    setErro(null);
    setSalvando(true);
    const res = await fetch("/api/business-hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: dias, outOfHoursMessage: mensagem }),
    });
    setSalvando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErro(typeof body.error === "string" ? body.error : "não deu pra salvar o horário");
      return;
    }
    setSalvo(true);
    mutate();
  }

  if (!data || !dias) return <p className="text-sm text-neutral-500">Carregando horário...</p>;

  const ligada = mensagem.trim().length > 0;

  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-4 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-800">Horário de atendimento</h2>
        <p className="text-xs text-neutral-600 mt-1">
          Fora desses horários, quem escrever e ainda não tiver atendente recebe a mensagem de
          ausência. Cada cliente recebe o aviso <strong>uma vez a cada 6 horas</strong>, então quem
          mandar várias mensagens seguidas de madrugada não leva várias respostas iguais.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        {dias.map((d) => (
          <div key={d.weekday} className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2 w-32 shrink-0">
              <input
                type="checkbox"
                checked={d.isOpen}
                disabled={!podeEditar}
                onChange={(e) => altera(d.weekday, { isOpen: e.target.checked })}
              />
              <span className={d.isOpen ? "text-neutral-800" : "text-neutral-400"}>
                {NOMES[d.weekday]}
              </span>
            </label>
            {d.isOpen ? (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={d.opensAt}
                  disabled={!podeEditar}
                  onChange={(e) => altera(d.weekday, { opensAt: e.target.value })}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <span className="text-neutral-400 text-xs">às</span>
                <input
                  type="time"
                  value={d.closesAt}
                  disabled={!podeEditar}
                  onChange={(e) => altera(d.weekday, { closesAt: e.target.value })}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            ) : (
              <span className="text-xs text-neutral-400">fechado</span>
            )}
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          Mensagem de ausência
        </label>
        <textarea
          value={mensagem}
          disabled={!podeEditar}
          onChange={(e) => {
            setMensagem(e.target.value);
            setSalvo(false);
          }}
          rows={3}
          placeholder="Ex: Olá! No momento estamos fora do horário de atendimento. Retornamos amanhã a partir das 8h."
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <p className="text-xs text-neutral-500 mt-1">
          {ligada
            ? "Deixe em branco pra desligar o aviso de ausência."
            : "Em branco: nenhum aviso de ausência é enviado."}
        </p>
      </div>

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      {podeEditar ? (
        <div className="flex items-center gap-3">
          <button
            onClick={salvar}
            disabled={salvando}
            className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar horário"}
          </button>
          {salvo && <span className="text-xs text-emerald-600">Salvo. Vale em até 1 minuto.</span>}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">
          Só o responsável pela conta pode alterar o horário de atendimento.
        </p>
      )}

      <p className="text-[11px] text-neutral-400">Fuso: {data.timezone}</p>
    </div>
  );
}
