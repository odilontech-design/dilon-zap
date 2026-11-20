import { prisma } from "@dilon-zap/ponto-db";
import { requireColaborador } from "@/lib/session";
import { horaNoFuso, hojeNoFuso, inicioDoDiaUtc, somarDias } from "@/lib/datas";
import { RegistrarPonto } from "./registrar-ponto";

export const dynamic = "force-dynamic";

export default async function PaginaBater() {
  const u = await requireColaborador();
  const fuso = u.empresa.timezone;
  const hoje = hojeNoFuso(fuso);

  const [colaborador, marcacoes] = await Promise.all([
    prisma.colaborador.findUniqueOrThrow({
      where: { id: u.colaboradorId },
      include: { empresa: { select: { exigirLocalizacao: true } } },
    }),
    // Últimas 24 horas, para o turno que começou ontem à noite também aparecer.
    prisma.marcacao.findMany({
      where: { colaboradorId: u.colaboradorId, instante: { gte: new Date(Date.now() - 20 * 3600_000) } },
      orderBy: { instante: "asc" },
      select: { id: true, nsr: true, instante: true },
    }),
  ]);

  const deHoje = marcacoes.filter((m) => m.instante >= inicioDoDiaUtc(somarDias(hoje, 0), fuso));

  return (
    <RegistrarPonto
      fuso={fuso}
      comFoto={colaborador.modoRegistro === "COM_FOTO"}
      pedirLocalizacao={colaborador.empresa.exigirLocalizacao}
      recentes={marcacoes.map((m) => ({ id: m.id, nsr: m.nsr, hora: horaNoFuso(m.instante, fuso), deHoje: deHoje.includes(m) }))}
      proxima={marcacoes.length % 2 === 0 ? "Entrada" : "Saída"}
    />
  );
}
