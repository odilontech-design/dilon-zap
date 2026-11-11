import Link from "next/link";
import { prisma } from "@dilon-zap/ponto-db";
import { requireColaborador } from "@/lib/session";
import { espelhoDoMes, SELECAO_EMPRESA_CALCULO } from "@/lib/calculo";
import { validarMes } from "@/lib/datas";
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

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <NavegacaoMes mes={mes} href={(m) => `/meu-ponto?mes=${m}`} />
        <Link href={`/espelho/${colaborador.id}?mes=${mes}`} className="text-sm text-accent">
          Espelho para imprimir
        </Link>
      </div>
      <ResumoEspelho espelho={espelho} />
      <LegendaEspelho />
      <Card>
        <TabelaEspelho espelho={espelho} colaboradorId={colaborador.id} mostrarFotos />
      </Card>
      <p className="text-xs text-neutral-500">
        Encontrou algo errado? Fale com o responsável pelo ponto na sua empresa: ele faz o ajuste e o motivo aparece aqui.
      </p>
    </div>
  );
}
