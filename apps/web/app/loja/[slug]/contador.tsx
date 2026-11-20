"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type Janela = Window & { __zapLoja?: string; __zapVeiculo?: string | null };

/** O id do carro pelo endereço (/loja/<slug>/<id> ou, no domínio próprio, /<id>). */
export function veiculoDoCaminho(caminho: string): string | null {
  const ultimo = caminho.split("?")[0].split("/").filter(Boolean).pop() ?? "";
  return /^c[a-z0-9]{20,30}$/.test(ultimo) ? ultimo : null;
}

/** Manda o evento sem segurar a página (sendBeacon quando dá). */
export function enviarEvento(slug: string, tipo: "visita" | "whatsapp", veiculoId: string | null) {
  const corpo = JSON.stringify({ tipo, ...(veiculoId ? { veiculoId } : {}) });
  const url = `/api/loja/${slug}/evento`;
  try {
    if (navigator.sendBeacon?.(url, new Blob([corpo], { type: "application/json" }))) return;
  } catch {
    /* segue para o fetch */
  }
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, keepalive: true }).catch(() => {});
}

/**
 * Conta a visita de cada página (uma vez por sessão do navegador) e todo clique num link de
 * WhatsApp do site (botões, cabeçalho, rodapé, telefones), para os relatórios da loja.
 * O formulário enviado conta no servidor.
 */
export function ContadorDeVisitas({ slug }: { slug: string }) {
  const caminho = usePathname();
  useEffect(() => {
    const veiculoId = veiculoDoCaminho(caminho);
    const w = window as Janela;
    w.__zapLoja = slug;
    w.__zapVeiculo = veiculoId;
    const chave = `zap-visita:${caminho}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, "1");
    } catch {
      /* sem sessionStorage: conta mesmo assim */
    }
    enviarEvento(slug, "visita", veiculoId);
  }, [slug, caminho]);

  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !/(^https?:\/\/(wa\.me|api\.whatsapp\.com)\/)|whatsapp:\/\//i.test(a.href)) return;
      enviarEvento(slug, "whatsapp", (window as Janela).__zapVeiculo ?? null);
    };
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, [slug]);
  return null;
}
