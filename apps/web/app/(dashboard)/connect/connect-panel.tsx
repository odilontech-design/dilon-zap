"use client";

import { useState } from "react";
import useSWR from "swr";
import { DASHBOARD_INTERVAL, WHATSAPP_STATUS_INTERVAL } from "@/lib/polling";
import { explicarErroDeConexao } from "@/lib/erro-conexao";

type Numero = {
  id: string;
  label: string;
  status: "PENDING_QR" | "CONNECTED" | "DISCONNECTED" | "LOGGED_OUT";
  qrCode: string | null;
  phoneNumber: string | null;
  lastError: string | null;
  setor: { id: string; nome: string; cor: string } | null;
};

type Setor = { id: string; nome: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS_LABEL: Record<Numero["status"], string> = {
  PENDING_QR: "Aguardando leitura do QR Code",
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado — tentando reconectar sozinho",
  LOGGED_OUT: "Desconectado — conecte de novo",
};

export function ConnectPanel({ podeAdicionar }: { podeAdicionar: boolean }) {
  // Ritmo rápido só enquanto a tela espera algo mudar (QR aparecer, pareamento
  // concluir, reconexão voltar). Com tudo conectado, cai pro ritmo lento.
  const { data: numeros, mutate } = useSWR<Numero[]>("/api/whatsapp/status", fetcher, {
    refreshInterval: (lista) =>
      lista?.every((n) => n.status === "CONNECTED") ? DASHBOARD_INTERVAL : WHATSAPP_STATUS_INTERVAL,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  async function conectar(corpo: Record<string, unknown> = {}) {
    setErro(null);
    setOcupado(true);
    const res = await fetch("/api/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setOcupado(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErro(typeof b.error === "string" ? b.error : "não deu pra conectar");
      return false;
    }
    mutate();
    return true;
  }

  async function desconectar(numero: Numero) {
    if (
      !confirm(
        `Desconectar "${numero.label}"? Você vai precisar escanear um QR Code novo pra voltar a usar este número.`
      )
    )
      return;

    setOcupado(true);
    setErro(null);
    const res = await fetch("/api/whatsapp/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: numero.id }),
    });
    setOcupado(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErro(typeof b.error === "string" ? b.error : "não deu pra desconectar");
      return;
    }
    mutate();
  }

  if (!numeros) return <p className="text-sm text-neutral-500">Carregando...</p>;
  if (!Array.isArray(numeros)) return <p className="text-sm text-red-600">não deu pra carregar os números</p>;

  if (numeros.length === 0) {
    return (
      <div className="max-w-sm">
        <p className="mb-4 text-sm text-neutral-600">
          Nenhum número conectado ainda. Clique abaixo e escaneie o QR Code que aparecer com o
          WhatsApp do número que vai atender.
        </p>
        {erro && <p className="mb-3 text-xs text-red-600">{erro}</p>}
        <button
          onClick={() => conectar()}
          disabled={ocupado}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Conectar número
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      {erro && <p className="mb-3 text-xs text-red-600">{erro}</p>}

      <div className="flex flex-col gap-3">
        {numeros.map((n) => (
          <div key={n.id} className="rounded-lg border border-neutral-200 bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{n.label}</span>
                  {n.setor ? (
                    <span
                      className="rounded border px-1.5 py-0.5 text-[11px]"
                      style={{ borderColor: `${n.setor.cor}55`, color: n.setor.cor, backgroundColor: `${n.setor.cor}14` }}
                    >
                      {n.setor.nome}
                    </span>
                  ) : (
                    <span className="rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">
                      Geral
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-600">{STATUS_LABEL[n.status]}</p>
                {n.phoneNumber && <p className="text-sm text-neutral-500">{n.phoneNumber}</p>}
                {n.status !== "CONNECTED" && explicarErroDeConexao(n.lastError) && (
                  <p className="mt-1 text-xs text-red-600">{explicarErroDeConexao(n.lastError)}</p>
                )}
              </div>

              <div className="shrink-0 text-sm">
                {n.status === "CONNECTED" && (
                  <button
                    onClick={() => desconectar(n)}
                    disabled={ocupado}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Desconectar
                  </button>
                )}
                {n.status === "LOGGED_OUT" && (
                  <button
                    onClick={() => conectar({ sessionId: n.id })}
                    disabled={ocupado}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Conectar de novo
                  </button>
                )}
              </div>
            </div>

            {n.status === "PENDING_QR" && (
              <div className="mt-3">
                {n.qrCode ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={n.qrCode}
                    alt={`QR Code de ${n.label}`}
                    className="h-64 w-64 rounded-md border border-neutral-200"
                  />
                ) : (
                  <p className="text-sm text-neutral-500">Gerando QR Code, aguarde alguns segundos...</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {podeAdicionar &&
        (adicionando ? (
          <FormNovoNumero
            onCancelar={() => setAdicionando(false)}
            onCriar={async (dados) => {
              if (await conectar({ novo: true, ...dados })) setAdicionando(false);
            }}
            ocupado={ocupado}
          />
        ) : (
          <button
            onClick={() => setAdicionando(true)}
            className="mt-4 rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
          >
            Conectar outro número
          </button>
        ))}
    </div>
  );
}

/**
 * Número adicional, com rótulo e setor dono.
 *
 * O setor é o que separa de verdade: conversa que chega num número de setor já
 * nasce na fila dele, os outros atendentes não veem, e o robô não fala ali —
 * quem escreve pro número do financeiro já sabe com quem quer falar.
 */
function FormNovoNumero({
  onCriar,
  onCancelar,
  ocupado,
}: {
  onCriar: (dados: { label: string; setorId: string | null }) => void;
  onCancelar: () => void;
  ocupado: boolean;
}) {
  const { data: setores } = useSWR<Setor[]>("/api/setores", fetcher);
  const [label, setLabel] = useState("");
  const [setorId, setSetorId] = useState("");

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 bg-surface p-4">
      <h3 className="font-medium">Conectar outro número</h3>
      <p className="mt-0.5 text-sm text-neutral-500">
        Precisa ser um número de WhatsApp diferente, com chip próprio.
      </p>

      <label className="mt-3 block text-sm">
        <span className="text-xs font-medium text-neutral-700">Como chamar este número</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          placeholder="Financeiro"
          className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
        />
      </label>

      <label className="mt-3 block text-sm">
        <span className="text-xs font-medium text-neutral-700">Setor dono</span>
        <select
          value={setorId}
          onChange={(e) => setSetorId(e.target.value)}
          className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
        >
          <option value="">Geral — todo mundo atende, com triagem</option>
          {(setores ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-500">
          Com um setor, a conversa que chegar aqui já entra na fila dele e só a equipe desse setor
          vê. O menu de triagem e a saudação não são enviados neste número.
        </span>
      </label>

      <div className="mt-4 flex justify-end gap-2 text-sm">
        <button onClick={onCancelar} className="px-3 py-1.5 text-neutral-600">
          Cancelar
        </button>
        <button
          onClick={() => onCriar({ label: label.trim() || "Novo número", setorId: setorId || null })}
          disabled={ocupado}
          className="rounded-md bg-accent px-4 py-1.5 font-medium text-white disabled:opacity-50"
        >
          Gerar QR Code
        </button>
      </div>
    </div>
  );
}
