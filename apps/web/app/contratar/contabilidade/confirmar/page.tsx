import type { Metadata } from "next";
import { ConfirmarContratacaoErp } from "@/components/confirmar-contratacao-erp";
import { LogoDilon } from "../../../login/logo-dilon";

export const metadata: Metadata = { title: "Confirmar contratação | Dilon Contabilidade", robots: { index: false } };
export const dynamic = "force-dynamic";

/** O link do e-mail abre esta página; a criação só acontece quando a pessoa clica no botão (POST). */
export default function Confirmar({ searchParams }: { searchParams: { t?: string } }) {
  const token = searchParams.t ?? "";
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-5 py-8">
        <LogoDilon />
        {token.length >= 20 ? <ConfirmarContratacaoErp token={token} /> : <p className="rounded-lg border border-neutral-200 bg-surface p-5 text-sm">Este link não é válido.</p>}
      </div>
    </div>
  );
}
