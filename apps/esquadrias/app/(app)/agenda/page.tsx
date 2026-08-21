import { requireRecurso } from "@/lib/session";
import { prisma } from "@dilon-zap/erp-db";
import { PainelAgenda } from "./painel-agenda";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const usuario = await requireRecurso("AGENDA");

  const [clientes, obras, equipe] = await Promise.all([
    prisma.cliente.findMany({ where: { empresaId: usuario.empresaId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.obra.findMany({
      where: { empresaId: usuario.empresaId, status: { notIn: ["CONCLUIDA", "CANCELADA"] } },
      select: { id: true, titulo: true },
      orderBy: { criadoEm: "desc" },
    }),
    prisma.usuario.findMany({
      where: { empresaId: usuario.empresaId, desativadoEm: null, papel: { not: "SUPERADMIN" } },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return <PainelAgenda clientes={clientes} obras={obras} equipe={equipe} />;
}
