import { prisma } from "@dilon-zap/ponto-db";
import { formatarMinutos } from "@dilon-zap/ponto-core";
import { requireAdmin } from "@/lib/session";
import { cargaSemanalMin, DIAS_CURTOS, resumoDia, type Semana } from "@/lib/jornada";
import { cabeMais, PLANOS } from "@/lib/planos";
import { Card, TituloPagina } from "@/components/ui";
import { EditorJornada } from "./editor-jornada";

export const dynamic = "force-dynamic";

export default async function PaginaJornadas() {
  const u = await requireAdmin();
  const jornadas = await prisma.jornada.findMany({
    where: { empresaId: u.empresaId },
    orderBy: { criadoEm: "asc" },
    include: { _count: { select: { colaboradores: { where: { ativo: true } } } } },
  });
  const limite = PLANOS[u.empresa.plano].maxJornadas;
  const podeCriar = cabeMais(limite, jornadas.filter((j) => j.ativa).length);

  return (
    <>
      <TituloPagina
        titulo="Jornadas"
        descricao={`Os horários de trabalho (turnos). Cada colaborador segue uma jornada. ${
          limite ? `Seu plano permite ${limite}: ${jornadas.length} em uso.` : ""
        }`}
      />

      <div className="space-y-4">
        {jornadas.map((j) => {
          const semana = j.semana as unknown as Semana;
          return (
            <Card key={j.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-neutral-900">{j.nome}</p>
                  <p className="text-sm text-neutral-500">
                    {formatarMinutos(cargaSemanalMin(semana))} por semana · {j._count.colaboradores} colaborador(es)
                  </p>
                </div>
                <EditorJornada jornada={{ id: j.id, nome: j.nome, semana }} />
              </div>
              <div className="grid grid-cols-7 gap-1 mt-4 text-xs">
                {DIAS_CURTOS.map((d, i) => (
                  <div key={d} className="rounded-lg bg-neutral-50 p-2">
                    <p className="font-medium text-neutral-700">{d}</p>
                    <p className="text-neutral-500 mt-0.5">{resumoDia(semana, i)}</p>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}

        {podeCriar ? (
          <Card className="p-5">
            <p className="font-medium text-neutral-900 mb-1">{jornadas.length ? "Nova jornada" : "Comece pela jornada"}</p>
            <p className="text-sm text-neutral-500 mb-3">
              Monte o horário da semana. Para turno que passa da meia-noite, é só colocar a saída menor que a entrada (ex.: 22:00 às 06:00).
            </p>
            <EditorJornada />
          </Card>
        ) : (
          <p className="text-sm text-neutral-500">
            Você está usando as {limite} jornadas do plano {PLANOS[u.empresa.plano].nome}. Para mais turnos, fale com a gente sobre o plano Ponto.
          </p>
        )}
      </div>
    </>
  );
}
