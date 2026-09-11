"use client";

import { useEffect, useState } from "react";
import { tamanhoDaPagina } from "@/lib/recibo";

/**
 * Barra de tela do recibo: mede o papel e chama a impressão.
 *
 * Nada daqui vai pro papel (.so-tela some no @media print). O que ela faz de
 * importante é invisível: mede a altura do recibo e troca o @page pelo
 * tamanho exato antes de abrir o diálogo — ver tamanhoDaPagina().
 */
export function ReciboAcoes({ larguraMm, imprimirAoAbrir }: { larguraMm: number; imprimirAoAbrir: boolean }) {
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const papel = document.querySelector<HTMLElement>(".recibo");
    if (!papel) return;

    // No fim do body, e não no head: entre duas regras @page vale a última do
    // documento, e a de fallback do servidor está dentro do body.
    const regra = document.createElement("style");
    document.body.appendChild(regra);
    const medir = () => {
      regra.textContent = tamanhoDaPagina(larguraMm, papel.getBoundingClientRect().height);
    };

    let cancelado = false;
    // Espera as fontes: medir antes mede a fonte de fallback, e o papel sairia
    // com a altura errada.
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (cancelado) return;
      medir();
      setPronto(true);
      if (imprimirAoAbrir) window.print();
    });

    window.addEventListener("beforeprint", medir);
    return () => {
      cancelado = true;
      window.removeEventListener("beforeprint", medir);
      regra.remove();
    };
  }, [larguraMm, imprimirAoAbrir]);

  return (
    <div className="so-tela barra-recibo">
      <button type="button" onClick={() => window.print()} disabled={!pronto} className="primario">
        Imprimir
      </button>
      <button type="button" onClick={() => window.close()}>
        Fechar
      </button>
      <span>
        Papel de {larguraMm} mm. Para mudar, abra Pedidos → Dados do recibo.
      </span>
    </div>
  );
}
