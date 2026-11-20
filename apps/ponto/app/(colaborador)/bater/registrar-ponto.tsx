"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Comprovante } from "@/lib/comprovante";

type Pendente = {
  idempotencia: string;
  canal: "APP" | "WEB";
  latitude: number | null;
  longitude: number | null;
  precisaoM: number | null;
  foto: string | null;
  offline: true;
  instanteDispositivo: string;
};

const CHAVE_PENDENTES = "ponto-pendentes";

function lerPendentes(): Pendente[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_PENDENTES) ?? "[]");
  } catch {
    return [];
  }
}
function gravarPendentes(lista: Pendente[]) {
  try {
    localStorage.setItem(CHAVE_PENDENTES, JSON.stringify(lista));
  } catch {
    // armazenamento bloqueado: a marcação só fica na tela
  }
}

function novaChave(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function obterLocalizacao(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 30_000,
    });
  });
}

export function RegistrarPonto({
  fuso,
  comFoto,
  pedirLocalizacao,
  recentes,
  proxima,
}: {
  fuso: string;
  comFoto: boolean;
  pedirLocalizacao: boolean;
  recentes: Array<{ id: string; nsr: number; hora: string; deHoje: boolean }>;
  proxima: "Entrada" | "Saída";
}) {
  const router = useRouter();
  const [agora, setAgora] = useState<Date | null>(null);
  const [estado, setEstado] = useState<"pronto" | "camera" | "enviando">("pronto");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [comprovante, setComprovante] = useState<Comprovante | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const sincronizando = useRef(false);

  useEffect(() => {
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const canal: "APP" | "WEB" =
    typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent))
      ? "APP"
      : "WEB";

  const enviar = useCallback(async (corpo: Record<string, unknown>) => {
    const r = await fetch("/api/marcacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(dados.error ?? "Não foi possível registrar."), { status: r.status });
    return dados as { comprovante: Comprovante; repetida: boolean };
  }, []);

  // Reenvia o que ficou guardado no aparelho sem internet.
  const sincronizar = useCallback(async () => {
    const lista = lerPendentes();
    setPendentes(lista.length);
    // Um reenvio por vez: o evento "online" pode chegar junto com o carregamento.
    if (!lista.length || !navigator.onLine || sincronizando.current) return;
    sincronizando.current = true;
    const restantes: Pendente[] = [];
    for (const p of lista) {
      try {
        await enviar(p);
      } catch (e) {
        // Erro de rede: tenta de novo depois. Recusa do servidor (4xx): descarta.
        const status = (e as { status?: number }).status;
        if (!status || status >= 500) restantes.push(p);
      }
    }
    gravarPendentes(restantes);
    setPendentes(restantes.length);
    sincronizando.current = false;
    if (restantes.length < lista.length) router.refresh();
  }, [enviar, router]);

  useEffect(() => {
    sincronizar();
    window.addEventListener("online", sincronizar);
    return () => window.removeEventListener("online", sincronizar);
  }, [sincronizar]);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  async function abrirCamera() {
    setErro(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640 }, audio: false });
      setEstado("camera");
      setTimeout(() => {
        if (video.current && stream.current) {
          video.current.srcObject = stream.current;
          video.current.play().catch(() => {});
        }
      }, 0);
    } catch {
      setErro("Não foi possível abrir a câmera. Você pode registrar sem foto; a marcação fica para conferência.");
    }
  }

  function tirarFoto(): string | null {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    const largura = 480;
    const altura = Math.round((v.videoHeight / v.videoWidth) * largura);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    canvas.getContext("2d")?.drawImage(v, 0, 0, largura, altura);
    return canvas.toDataURL("image/jpeg", 0.7);
  }

  function fecharCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function registrar(foto: string | null) {
    setEstado("enviando");
    setErro(null);
    setAviso(null);
    setComprovante(null);
    const instanteDispositivo = new Date().toISOString();
    const posicao = pedirLocalizacao ? await obterLocalizacao() : null;
    const corpo = {
      idempotencia: novaChave(),
      canal,
      latitude: posicao?.coords.latitude ?? null,
      longitude: posicao?.coords.longitude ?? null,
      precisaoM: posicao ? Math.round(posicao.coords.accuracy) : null,
      foto,
    };
    if (pedirLocalizacao && !posicao) {
      setAviso("Não conseguimos a sua localização. A marcação foi enviada mesmo assim e fica para conferência.");
    }
    try {
      const r = await enviar(corpo);
      setComprovante(r.comprovante);
      router.refresh();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (!status || status >= 500) {
        // Sem internet (ou servidor fora): guarda no aparelho com a hora de agora.
        const lista = lerPendentes();
        lista.push({ ...corpo, offline: true, instanteDispositivo } as Pendente);
        gravarPendentes(lista);
        setPendentes(lista.length);
        setAviso("Sem conexão. A marcação ficou guardada neste aparelho e será enviada sozinha quando a internet voltar. Não feche o navegador em modo anônimo.");
      } else {
        setErro((e as Error).message);
      }
    } finally {
      setEstado("pronto");
    }
  }

  async function aoClicar() {
    if (comFoto && estado === "pronto") return abrirCamera();
    if (estado === "camera") {
      const foto = tirarFoto();
      fecharCamera();
      return registrar(foto);
    }
    return registrar(null);
  }

  const relogio = agora
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(agora)
    : "--:--:--";
  const data = agora
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, weekday: "long", day: "numeric", month: "long" }).format(agora)
    : "";

  return (
    <div className="space-y-5 py-4">
      <div className="text-center">
        <p className="text-5xl font-semibold tabular-nums text-neutral-900">{relogio}</p>
        <p className="text-sm text-neutral-500 mt-1">{data.charAt(0).toUpperCase() + data.slice(1)}</p>
      </div>

      {estado === "camera" && (
        <div className="rounded-xl overflow-hidden border border-neutral-200 bg-black aspect-[3/4] max-w-xs mx-auto">
          <video ref={video} playsInline muted className="w-full h-full object-cover -scale-x-100" />
        </div>
      )}

      <button
        onClick={aoClicar}
        disabled={estado === "enviando"}
        className="w-full rounded-2xl bg-accent py-6 text-xl font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-60"
      >
        {estado === "enviando"
          ? "Registrando…"
          : estado === "camera"
            ? "Tirar foto e registrar"
            : `Registrar ${proxima.toLowerCase()}`}
      </button>

      {estado === "camera" && (
        <button
          onClick={() => {
            fecharCamera();
            registrar(null);
          }}
          className="w-full text-sm text-neutral-500"
        >
          Registrar sem foto
        </button>
      )}

      {erro && <p className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
      {aviso && <p className="text-sm text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">{aviso}</p>}
      {pendentes > 0 && (
        <p className="text-sm text-amber-700">
          {pendentes} {pendentes === 1 ? "marcação aguardando" : "marcações aguardando"} internet para envio.
        </p>
      )}

      {comprovante && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <p className="font-semibold text-emerald-700">✓ Ponto registrado</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-neutral-700">
            <dt className="text-neutral-500">Data e hora</dt>
            <dd className="tabular-nums">{comprovante.dataHora}</dd>
            <dt className="text-neutral-500">NSR</dt>
            <dd className="tabular-nums">{comprovante.nsr}</dd>
            <dt className="text-neutral-500">Colaborador</dt>
            <dd>
              {comprovante.colaborador} · CPF {comprovante.cpf}
            </dd>
            <dt className="text-neutral-500">Empregador</dt>
            <dd>
              {comprovante.empresa} · {comprovante.cnpj}
            </dd>
            <dt className="text-neutral-500">Registro</dt>
            <dd>
              {comprovante.canal}
              {comprovante.localizacao ? " · com localização" : ""}
              {comprovante.offline ? " · feita sem internet" : ""}
            </dd>
            <dt className="text-neutral-500">Código</dt>
            <dd className="font-mono text-xs break-all">{comprovante.hash}</dd>
          </dl>
        </div>
      )}

      <section>
        <h2 className="text-sm font-medium text-neutral-500 mb-2">Últimas marcações</h2>
        {recentes.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma marcação nas últimas horas.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {recentes.map((m) => (
              <li key={m.id} className="rounded-lg border border-neutral-200 bg-surface px-3 py-1.5 text-sm tabular-nums" title={`NSR ${m.nsr}`}>
                {m.hora}
                {!m.deHoje && <span className="text-xs text-neutral-400"> (ontem)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
