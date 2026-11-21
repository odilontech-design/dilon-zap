"use client";

import { useState, useTransition } from "react";
import { Botao, Entrada } from "@/components/campos";
import { decidirSolicitacao } from "@/lib/solicitacoes";

export function Decisao({ id }: { id: string }) {
  const [recusando, setRecusando] = useState(false);
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const decidir = (aprovar: boolean) =>
    iniciar(async () => {
      setErro(null);
      const r = await decidirSolicitacao({ id, aprovar, resposta: resposta || undefined });
      if (!r.ok) setErro(r.erro);
    });

  return (
    <div className="space-y-2">
      {recusando ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Entrada autoFocus placeholder="Motivo da recusa" value={resposta} onChange={(e) => setResposta(e.target.value)} />
          <div className="flex gap-2">
            <Botao variante="perigo" disabled={pendente} onClick={() => decidir(false)}>
              Recusar
            </Botao>
            <Botao variante="secundario" onClick={() => setRecusando(false)}>
              Voltar
            </Botao>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Botao disabled={pendente} onClick={() => decidir(true)}>
            {pendente ? "Salvando…" : "Aprovar"}
          </Botao>
          <Botao variante="secundario" disabled={pendente} onClick={() => setRecusando(true)}>
            Recusar
          </Botao>
        </div>
      )}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
