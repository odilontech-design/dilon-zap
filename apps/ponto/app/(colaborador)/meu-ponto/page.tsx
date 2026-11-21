import Link from "@/components/link";
import { prisma } from "@dilon-zap/ponto-db";
import { requireColaborador } from "@/lib/session";
import { temRecurso } from "@/lib/planos";
import { espelhoDoMes, SELECAO_EMPRESA_CALCULO } from "@/lib/calculo";
import { dataHoraNoFuso, validarMes } from "@/lib/datas";
import { NavegacaoMes } from "@/components/navegacao-mes";
import { LegendaEspelho, ResumoEspelho, TabelaEspelho } from "@/components/espelho";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MeuPonto({ searchParams }: { searchParams: { mes?: string } }) {
  const u = await requireColaborador();
  const mes = validarMes(searchParams.mes, u.empresa.timezone);
  const [empresa, colaborador] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: u.empresaId }, select: SELECAO_EMPRESA_CALCULO }),
    prisma.colaborador.findUniqueOrThrow({ where: { id: u.colaboradorId }, include: { jornada: { select: { semana: true } } } }),
  ]);
  const espelho = await espelhoDoMes(empresa, colaborador, mes);
  // Portaria 671, art. 80, III: extração dos comprovantes das marcações (no mínimo 48 h).
  const recentes = await prisma.marcacao.findMany({
    where: { colaboradorId: colaborador.id, instante: { gte: new Date(Date.now() - 31 * 86_400_000) } },
    orderBy: { instante: "desc" },
    select: { id: true, nsr: true, instante: true },
  });

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <NavegacaoMes mes={mes} href={(m) => `/meu-ponto?mes=${m}`} />
        <Link href={`/espelho/${colaborador.id}?mes=${mes}`} className="text-sm text-accent whitespace-nowrap">
          Imprimir
        </Link>
      </div>
      <ResumoEspelho espelho={espelho} />
      <LegendaEspelho />
      <Card>
        <TabelaEspelho espelho={espelho} colaboradorId={colaborador.id} mostrarFotos formato="cartoes" />
      </Card>
      <Card className="p-4">
        <p className="text-sm font-medium text-neutral-900">Comprovantes de registro (últimos 30 dias)</p>
        {recentes.length === 0 ? (
          <p className="text-sm text-neutral-500 mt-2">Nenhuma marcação nos últimos 30 dias.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200 text-sm">
            {recentes.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <span className="tabular-nums text-neutral-700">
                  {dataHoraNoFuso(m.instante, empresa.timezone)} <span className="text-neutral-400">· NSR {m.nsr}</span>
                </span>
                <a href={`/api/marcacoes/${m.id}/comprovante`} target="_blank" rel="noreferrer" className="text-accent whitespace-nowrap">
                  PDF
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {temRecurso(u.empresa.plano, "SOLICITACOES") ? (
        <p className="text-xs text-neutral-500">
          Encontrou algo errado?{" "}
          <Link href="/minhas-solicitacoes" className="text-accent">
            Peça o ajuste
          </Link>
          : a empresa aprova e o motivo aparece aqui.
        </p>
      ) : (
        <p className="text-xs text-neutral-500">
          Encontrou algo errado? Fale com o responsável pelo ponto na sua empresa: ele faz o ajuste e o motivo aparece aqui.
        </p>
      )}
    </div>
  );
}
