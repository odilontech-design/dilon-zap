import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

/**
 * A agenda: tarefas de todas as negociações da empresa.
 *
 * ?quando=atrasadas | hoje | proximas | concluidas
 * ?responsavelId=<id> | sem   (padrão: todos)
 * ?tipo=LIGACAO | ...
 *
 * Os limites de "hoje" são os do dia em Brasília: tarefa marcada para as 22h
 * é de hoje, não de amanhã por causa do UTC.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;

  const agora = new Date();
  const br = new Date(agora.getTime() - 3 * 3_600_000);
  const inicioHoje = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3, 0, 0));
  const fimHoje = new Date(inicioHoje.getTime() + 86_400_000);

  const quando = q.get("quando") ?? "hoje";
  const faixa =
    quando === "atrasadas"
      ? { concluidaEm: null, venceEm: { lt: agora } }
      : quando === "proximas"
        ? { concluidaEm: null, venceEm: { gte: fimHoje } }
        : quando === "concluidas"
          ? { concluidaEm: { not: null } }
          : // hoje: o que vence hoje e ainda não passou do prazo de ontem — as
            // atrasadas têm aba própria, para não se misturarem com o dia.
            { concluidaEm: null, venceEm: { gte: inicioHoje, lt: fimHoje } };

  const responsavel = q.get("responsavelId");
  const tipo = q.get("tipo");

  const tarefas = await prisma.tarefaNegociacao.findMany({
    where: {
      tenantId: user.tenantId,
      ...faixa,
      ...(responsavel === "sem" ? { responsavelId: null } : responsavel ? { responsavelId: responsavel } : {}),
      ...(tipo ? { tipo: tipo as never } : {}),
      // Tarefa de negociação encerrada não é mais "a fazer".
      ...(quando === "concluidas" ? {} : { negociacao: { status: "ABERTA" } }),
    },
    orderBy: quando === "concluidas" ? { concluidaEm: "desc" } : { venceEm: "asc" },
    take: 200,
    select: {
      id: true,
      tipo: true,
      titulo: true,
      venceEm: true,
      concluidaEm: true,
      resultado: true,
      anotacao: true,
      responsavel: { select: { id: true, name: true } },
      negociacao: {
        select: {
          id: true,
          titulo: true,
          funil: { select: { nome: true } },
          contact: { select: { id: true, name: true, phoneNumber: true, waJid: true } },
        },
      },
    },
  });

  // Contagens das abas, no mesmo recorte de responsável/tipo.
  const base = {
    tenantId: user.tenantId,
    ...(responsavel === "sem" ? { responsavelId: null } : responsavel ? { responsavelId: responsavel } : {}),
    ...(tipo ? { tipo: tipo as never } : {}),
    negociacao: { status: "ABERTA" as const },
    concluidaEm: null,
  };
  const [atrasadas, hoje, proximas] = await Promise.all([
    prisma.tarefaNegociacao.count({ where: { ...base, venceEm: { lt: agora } } }),
    prisma.tarefaNegociacao.count({ where: { ...base, venceEm: { gte: inicioHoje, lt: fimHoje } } }),
    prisma.tarefaNegociacao.count({ where: { ...base, venceEm: { gte: fimHoje } } }),
  ]);

  const usuarios = await prisma.user.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    contagens: { atrasadas, hoje, proximas },
    usuarios,
    tarefas: tarefas.map((t) => ({
      id: t.id,
      tipo: t.tipo,
      titulo: t.titulo,
      venceEm: t.venceEm,
      concluidaEm: t.concluidaEm,
      resultado: t.resultado,
      anotacao: t.anotacao,
      responsavel: t.responsavel,
      negociacao: { id: t.negociacao.id, titulo: t.negociacao.titulo, funil: t.negociacao.funil.nome },
      contato: {
        id: t.negociacao.contact.id,
        nome: t.negociacao.contact.name,
        // Telefone só em dígitos, para o tel: e para exibir. @lid não é número.
        telefone:
          t.negociacao.contact.phoneNumber ??
          (t.negociacao.contact.waJid.endsWith("@s.whatsapp.net") ? t.negociacao.contact.waJid.split("@")[0] : null),
      },
    })),
  });
}
