"use client";

import useSWR from "swr";

type WhatsAppSessionView = {
  id: string;
  status: "PENDING_QR" | "CONNECTED" | "DISCONNECTED" | "LOGGED_OUT";
  qrCode: string | null;
  phoneNumber: string | null;
  lastError: string | null;
} | null;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS_LABEL: Record<NonNullable<WhatsAppSessionView>["status"], string> = {
  PENDING_QR: "Aguardando leitura do QR Code",
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado — tentando reconectar sozinho",
  LOGGED_OUT: "Desconectado pelo celular — conecte de novo",
};

export function ConnectPanel() {
  const { data: session, mutate } = useSWR<WhatsAppSessionView>("/api/whatsapp/status", fetcher, {
    refreshInterval: 2000,
  });

  async function handleConnect() {
    await fetch("/api/whatsapp/connect", { method: "POST" });
    mutate();
  }

  if (session === undefined) return <p className="text-sm text-neutral-500">Carregando...</p>;

  if (!session) {
    return (
      <div className="max-w-sm">
        <p className="text-sm text-neutral-600 mb-4">
          Nenhum número conectado ainda. Clique abaixo, escaneie o QR Code que aparecer com o
          WhatsApp do número que vai atender.
        </p>
        <button
          onClick={handleConnect}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Conectar número
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-sm">
      <p className="text-sm font-medium mb-1">{STATUS_LABEL[session.status]}</p>
      {session.phoneNumber && <p className="text-sm text-neutral-500 mb-4">{session.phoneNumber}</p>}
      {session.lastError && session.status !== "CONNECTED" && (
        <p className="text-xs text-red-600 mb-4">{session.lastError}</p>
      )}

      {session.status === "PENDING_QR" && session.qrCode && (
        <img src={session.qrCode} alt="QR Code do WhatsApp" className="w-64 h-64 border border-neutral-200 rounded-md" />
      )}
      {session.status === "PENDING_QR" && !session.qrCode && (
        <p className="text-sm text-neutral-500">Gerando QR Code, aguarde alguns segundos...</p>
      )}

      {session.status === "LOGGED_OUT" && (
        <button
          onClick={handleConnect}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Conectar de novo
        </button>
      )}
    </div>
  );
}
