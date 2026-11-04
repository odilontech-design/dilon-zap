import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { contratacaoDisponivel } from "@/lib/erp-contratacao-servico";
import { PLANOS_DE_AUTOATENDIMENTO, type PlanoDeAutoatendimento } from "@/lib/erp-regras";
import { ContratarErp } from "@/components/contratar-erp";
import { LogoDilon } from "../../login/logo-dilon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contratar o Dilon Contabilidade",
  description: "O sistema da rotina do seu escritório contábil. 14 dias grátis, sem cartão para começar.",
};

/** Pública. O plano pode vir no link (?plano=PROFISSIONAL), para a página de vendas apontar direto para um plano. */
export default function ContratarContabilidade({ searchParams }: { searchParams: { plano?: string } }) {
  const plano = PLANOS_DE_AUTOATENDIMENTO.find((p) => p === searchParams.plano?.toUpperCase()) as PlanoDeAutoatendimento | undefined;
  const disponivel = contratacaoDisponivel();
  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-8">
        <a href="https://dilontech.com.br/contabilidade" className="w-fit" aria-label="Conhecer o Dilon Contabilidade"><LogoDilon /></a>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-neutral-900">Dilon Contabilidade: <span className="text-accent">14 dias grátis.</span></h1>
          <p className="text-sm text-neutral-600">Rotinas da equipe, fiscal, contabilidade, financeiro, documentos e portal do cliente num só sistema para o seu escritório.</p>
        </div>
        {disponivel ? (
          <ContratarErp planoInicial={plano ?? null} />
        ) : (
          <p className="rounded-lg border border-neutral-200 bg-surface p-5 text-sm text-neutral-700">A contratação online está indisponível no momento. Fale com a Dilon Tech e liberamos o seu acesso.</p>
        )}
        <p className="text-center text-xs text-neutral-500">Já é cliente? <a href="https://dilontech.com.br/contabilidade" className="font-medium text-accent underline underline-offset-4">Acesse o seu escritório</a></p>
      </div>
    </div>
  );
}
