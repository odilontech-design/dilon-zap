"use client";

import { useState, useTransition } from "react";
import { Botao } from "@/components/campos";
import { atualizarAssinatura } from "./acoes";

export function BotaoAtualizar({ rotulo }: { rotulo: string }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Botao
        variante="secundario"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await atualizarAssinatura();
            setMsg(r.ok ? "Situação atualizada." : r.erro);
          })
        }
      >
        {pendente ? "Consultando…" : rotulo}
      </Botao>
      {msg && <span className="text-sm text-neutral-600">{msg}</span>}
    </div>
  );
}

export function CopiarLinha({ linha }: { linha: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(linha).then(() => setCopiado(true))}
      className="text-xs text-accent hover:underline"
    >
      {copiado ? "copiada ✓" : "copiar linha digitável"}
    </button>
  );
}
