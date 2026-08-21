"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviar } from "@/lib/fetcher";

/**
 * Duplicar é o caminho real de adoção: ninguém escreve a primeira tipologia
 * do zero — pega a que já veio, copia e troca o perfil pela linha que compra.
 */
export function BotaoDuplicar({ tipologiaId }: { tipologiaId: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  return (
    <button
      disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        try {
          const copia = await enviar<{ id: string }>(`/api/tipologias/${tipologiaId}/duplicar`, "POST");
          router.push(`/tipologias/${copia.id}`);
        } catch {
          setOcupado(false);
        }
      }}
      className="text-neutral-600 hover:underline disabled:opacity-60"
    >
      {ocupado ? "duplicando…" : "duplicar"}
    </button>
  );
}
