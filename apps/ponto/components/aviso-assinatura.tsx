import Link from "next/link";
import type { SituacaoAssinatura } from "@/lib/cobranca-regras";
import { dataBr } from "@/lib/datas";

/** Faixa no topo do painel enquanto há mensalidade em aberto. */
export function AvisoAssinatura({ situacao: s }: { situacao: SituacaoAssinatura }) {
  if (s.estado === "AGUARDANDO_PAGAMENTO" && s.emAberto) {
    return (
      <Faixa tom="info">
        Boleto da mensalidade com vencimento em {dataBr(s.emAberto.vencimento)}.{" "}
        <Link href="/assinatura" className="font-medium underline">
          Ver boleto
        </Link>
      </Faixa>
    );
  }
  if (s.estado === "VENCIDA" && s.emAberto) {
    return (
      <Faixa tom="alerta">
        A mensalidade venceu em {dataBr(s.emAberto.vencimento)}.{" "}
        {s.diasParaBloqueio === 0 ? "O painel será bloqueado amanhã" : `O painel será bloqueado em ${s.diasParaBloqueio} dias`} se
        não houver pagamento. Seus colaboradores continuam batendo ponto normalmente.{" "}
        <Link href="/assinatura" className="font-medium underline">
          Pagar agora
        </Link>
      </Faixa>
    );
  }
  if (s.estado === "SEM_BOLETO") {
    return (
      <Faixa tom="info">
        O boleto da mensalidade ainda não foi gerado.{" "}
        <Link href="/assinatura" className="font-medium underline">
          Ver assinatura
        </Link>
      </Faixa>
    );
  }
  return null;
}

function Faixa({ tom, children }: { tom: "info" | "alerta"; children: React.ReactNode }) {
  const cor = tom === "alerta" ? "border-red-500/30 bg-red-500/10 text-red-700" : "border-accent/30 bg-accent/10 text-neutral-800";
  return <div className={`mb-5 rounded-lg border px-4 py-2.5 text-sm nao-imprimir ${cor}`}>{children}</div>;
}
