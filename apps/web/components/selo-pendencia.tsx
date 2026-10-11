"use client";

export type PendenciaResumo = { saldoCents: number; parcelas: number; vencidas: number; vencidoCents: number };

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O selo de quem deve: aparece na ficha, no Inbox, no CRM e na lista de
 * contatos. Em atraso fala mais alto (vermelho) que só em aberto (âmbar), e o
 * texto diz as duas coisas — a cor nunca é a única pista.
 *
 * Pedido da Believe: quem atende precisa ver na hora que a cliente tem parcela
 * pendente, antes de prometer uma venda a prazo que o sistema vai bloquear.
 */
export function SeloPendencia({ pendencia, compacto = false }: { pendencia: PendenciaResumo | null | undefined; compacto?: boolean }) {
  if (!pendencia || pendencia.saldoCents <= 0) return null;
  const atrasado = pendencia.vencidas > 0;
  const texto = compacto
    ? atrasado
      ? `Em atraso ${brl(pendencia.vencidoCents)}`
      : `Deve ${brl(pendencia.saldoCents)}`
    : atrasado
      ? `Deve ${brl(pendencia.saldoCents)} · ${brl(pendencia.vencidoCents)} em atraso`
      : `Deve ${brl(pendencia.saldoCents)} em ${pendencia.parcelas} parcela(s)`;

  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${
        atrasado ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
      }`}
      title={`${pendencia.parcelas} parcela(s) em aberto${atrasado ? `, ${pendencia.vencidas} vencida(s)` : ""}`}
    >
      {texto}
    </span>
  );
}
