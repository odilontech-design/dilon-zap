import { notFound, redirect } from "next/navigation";
import { prisma } from "@dilon-zap/ponto-db";
import { formatarMinutos } from "@dilon-zap/ponto-core";
import { requireUsuario } from "@/lib/session";
import { espelhoDoMes, SELECAO_EMPRESA_CALCULO } from "@/lib/calculo";
import { dataBr, dataHoraNoFuso, nomeDoMes, validarMes } from "@/lib/datas";
import { formatarCnpj, formatarCpf } from "@/lib/documentos";
import { cargaSemanalMin } from "@/lib/jornada";
import type { Semana } from "@/lib/jornada";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { ResumoEspelho, TabelaEspelho, LegendaEspelho } from "@/components/espelho";
import { NavegacaoMes } from "@/components/navegacao-mes";

export const dynamic = "force-dynamic";

/** Espelho de ponto para imprimir e assinar. O colaborador só vê o próprio. */
export default async function PaginaEspelho({
  params,
  searchParams,
}: {
  params: { colaboradorId: string };
  searchParams: { mes?: string };
}) {
  const u = await requireUsuario();
  if (u.papel !== "ADMIN" && u.colaboradorId !== params.colaboradorId) redirect("/meu-ponto");

  const colaborador = await prisma.colaborador.findFirst({
    where: { id: params.colaboradorId, empresaId: u.empresaId },
    include: { jornada: { select: { semana: true, nome: true } } },
  });
  if (!colaborador) notFound();

  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: u.empresaId },
    select: { ...SELECAO_EMPRESA_CALCULO, razaoSocial: true, cnpj: true },
  });
  const mes = validarMes(searchParams.mes, empresa.timezone);
  const espelho = await espelhoDoMes(empresa, colaborador, mes);

  return (
    <main className="mx-auto max-w-5xl p-5 md:p-8 bg-surface min-h-screen">
      <div className="flex items-center justify-between gap-3 mb-6 nao-imprimir">
        <NavegacaoMes mes={mes} href={(m) => `/espelho/${colaborador.id}?mes=${m}`} />
        <BotaoImprimir />
      </div>

      <header className="mb-5">
        <h1 className="text-xl font-semibold text-neutral-900">Espelho de ponto — {nomeDoMes(mes)}</h1>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-1 mt-3 text-sm text-neutral-700">
          <p>
            <span className="text-neutral-500">Empregador:</span> {empresa.razaoSocial}
          </p>
          <p>
            <span className="text-neutral-500">CNPJ:</span> {formatarCnpj(empresa.cnpj)}
          </p>
          <p>
            <span className="text-neutral-500">Colaborador:</span> {colaborador.nome}
          </p>
          <p>
            <span className="text-neutral-500">CPF:</span> {formatarCpf(colaborador.cpf)}
            {colaborador.pis && <> · PIS {colaborador.pis}</>}
          </p>
          <p>
            <span className="text-neutral-500">Cargo:</span> {colaborador.cargo || "—"} · <span className="text-neutral-500">Admissão:</span>{" "}
            {dataBr(colaborador.admissao.toISOString().slice(0, 10))}
          </p>
          <p>
            <span className="text-neutral-500">Jornada:</span> {colaborador.jornada.nome} (
            {formatarMinutos(cargaSemanalMin(colaborador.jornada.semana as unknown as Semana))} semanais)
          </p>
        </div>
      </header>

      <ResumoEspelho espelho={espelho} />
      <div className="my-4">
        <LegendaEspelho />
      </div>
      <div className="rounded-xl border border-neutral-200">
        <TabelaEspelho espelho={espelho} colaboradorId={colaborador.id} />
      </div>

      <section className="mt-10 grid md:grid-cols-2 gap-10 text-sm text-neutral-700">
        <div className="border-t border-neutral-400 pt-2 text-center">{colaborador.nome}</div>
        <div className="border-t border-neutral-400 pt-2 text-center">{empresa.razaoSocial}</div>
      </section>
      <p className="mt-6 text-xs text-neutral-500">
        Gerado em {dataHoraNoFuso(new Date(), empresa.timezone)} pelo Dilon Ponto. Marcações originais preservadas; ajustes identificados com
        autor e motivo.
      </p>
    </main>
  );
}
