"use client";

import { useRef, useState } from "react";
import { botaoSecundario, erroDaResposta, rotulo } from "../comum";

/** Envia ou remove a logo ou o banner da vitrine. Vai na hora, sem esperar o botão Salvar. */
export function ImagemDaMarca({
  tipo,
  titulo,
  dica,
  slug,
  tem,
  versao,
  onMudou,
  onAviso,
}: {
  tipo: "logo" | "banner";
  titulo: string;
  dica: string;
  slug: string;
  tem: boolean;
  versao: number;
  onMudou: () => void;
  onAviso: (a: { texto: string; erro?: boolean }) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    setOcupado(true);
    const form = new FormData();
    form.set("tipo", tipo);
    form.set("file", arquivo);
    const r = await fetch("/api/veiculos/config/imagem", { method: "POST", body: form });
    setOcupado(false);
    if (entrada.current) entrada.current.value = "";
    if (!r.ok) return onAviso({ texto: await erroDaResposta(r), erro: true });
    onAviso({ texto: `${titulo} atualizado.` });
    onMudou();
  }

  async function remover() {
    setOcupado(true);
    const r = await fetch(`/api/veiculos/config/imagem?tipo=${tipo}`, { method: "DELETE" });
    setOcupado(false);
    if (!r.ok) return onAviso({ texto: await erroDaResposta(r), erro: true });
    onAviso({ texto: `${titulo} removido.` });
    onMudou();
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={rotulo}>{titulo}</span>
      <div className={`flex items-center justify-center overflow-hidden rounded-md border border-dashed border-neutral-300 bg-neutral-50 ${tipo === "logo" ? "h-24" : "h-24"}`}>
        {tem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/loja/${slug}/marca/${tipo}?v=${versao}`} alt={titulo} className={tipo === "logo" ? "max-h-20 max-w-full object-contain" : "h-full w-full object-cover"} />
        ) : (
          <span className="text-xs text-neutral-400">Sem imagem</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label={`Enviar ${titulo.toLowerCase()}`} onChange={(e) => enviar(e.target.files?.[0])} />
        <button type="button" className={botaoSecundario} disabled={ocupado} onClick={() => entrada.current?.click()}>
          {ocupado ? "Enviando…" : tem ? "Trocar" : "Enviar"}
        </button>
        {tem && (
          <button type="button" className="text-xs text-neutral-500 hover:text-neutral-800" disabled={ocupado} onClick={remover}>
            remover
          </button>
        )}
      </div>
      <span className="text-xs text-neutral-500">{dica}</span>
    </div>
  );
}
