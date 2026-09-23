"use client";

import { useEffect, useState } from "react";

/**
 * Liga/desliga a notificação no celular deste aparelho.
 *
 * Uma inscrição por APARELHO: quem usa no computador e no celular precisa
 * permitir nos dois, e desligar num não desliga no outro — é o que a pessoa
 * espera, e é como o navegador expõe.
 *
 * No iPhone só funciona depois de "Adicionar à Tela de Início": é regra do
 * Safari, não escolha nossa. Por isso o aviso na tela em vez de um botão que
 * simplesmente não faria nada.
 */

// A chave pública vem em base64url e a API do navegador quer bytes.
//
// O ArrayBuffer é criado explicitamente porque o Uint8Array.from devolve
// Uint8Array<ArrayBufferLike>, que o tipo de applicationServerKey recusa (ele
// exige ArrayBuffer de verdade, não a versão que também aceita memória
// compartilhada).
function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const preenchido = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(preenchido);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type Estado =
  | "carregando"
  | "sem-suporte"
  | "sem-chave"
  | "precisa-instalar"
  | "desligado"
  | "ligado"
  | "bloqueado";

export function Notificacoes() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      const temSuporte = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      // iPhone: o Safari só expõe push pra site instalado na tela inicial.
      // Sem isso, `PushManager` nem existe — então o "sem suporte" do iOS na
      // prática quer dizer "ainda não instalou".
      const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!temSuporte) {
        setEstado(ehIOS && !instalado ? "precisa-instalar" : "sem-suporte");
        return;
      }

      if (Notification.permission === "denied") {
        setEstado("bloqueado");
        return;
      }

      const registro = await navigator.serviceWorker.register("/sw.js");
      const inscricao = await registro.pushManager.getSubscription();
      setEstado(inscricao ? "ligado" : "desligado");
    })().catch(() => setEstado("sem-suporte"));
  }, []);

  async function ligar() {
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }

      // Chave ausente é falha nossa (build sem a variável), não limitação do
      // aparelho — dizer "seu navegador não recebe" mandaria o cliente caçar
      // defeito no lugar errado.
      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chave) {
        setEstado("sem-chave");
        return;
      }

      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(chave),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inscricao.toJSON()),
      });
      setEstado(res.ok ? "ligado" : "desligado");
    } catch {
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.getSubscription();
      if (inscricao) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        });
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando") return null;

  if (estado === "precisa-instalar") {
    return (
      <p className="text-xs text-neutral-500">
        Pra receber aviso no iPhone, toque em Compartilhar e depois em &quot;Adicionar à Tela de Início&quot;. Abrindo
        por lá, o botão de ativar aparece aqui.
      </p>
    );
  }

  if (estado === "sem-suporte") {
    return <p className="text-xs text-neutral-500">Este navegador não recebe notificação.</p>;
  }

  if (estado === "sem-chave") {
    return (
      <p className="text-xs text-neutral-500">
        Os avisos ainda não estão configurados neste servidor — fale com o suporte da Dilon Tech.
      </p>
    );
  }

  if (estado === "bloqueado") {
    return (
      <p className="text-xs text-neutral-500">
        A notificação está bloqueada nas configurações do navegador para este site — libere por lá pra conseguir
        ativar aqui.
      </p>
    );
  }

  return (
    <button
      onClick={estado === "ligado" ? desligar : ligar}
      disabled={ocupado}
      className={`text-xs rounded-md border px-3 py-1.5 disabled:opacity-50 ${
        estado === "ligado"
          ? "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
          : "border-accent text-accent hover:bg-accent/5"
      }`}
    >
      {ocupado
        ? "Aguarde..."
        : estado === "ligado"
          ? "Desativar avisos neste aparelho"
          : "Receber avisos neste aparelho"}
    </button>
  );
}
