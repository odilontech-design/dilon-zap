import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { configDaOtica, consultorValido, dadosDoCliente, previsaoDaTela } from "@/lib/otica";
import { validadeDaReceita } from "@/lib/otica-regras";
import { editarOSSchema, paraData } from "@/lib/otica-schemas";

/** Tudo de uma OS: a ficha do cliente, a receita, os valores e o histórico. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const ordem = await prisma.ordemServico.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          waName: true,
          phoneNumber: true,
          waJid: true,
          documento: true,
          rgIe: true,
          nascimento: true,
          email: true,
          cep: true,
          logradouro: true,
          numeroEndereco: true,
          bairro: true,
          cidade: true,
        },
      },
      receita: true,
      laboratorio: { select: { id: true, nome: true, telefone: true } },
      consultor: { select: { id: true, name: true } },
      eventos: { orderBy: { createdAt: "desc" }, include: { por: { select: { name: true } } } },
    },
  });
  if (!ordem) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });
  return NextResponse.json(ordem);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const parsed = editarOSSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const ordem = await prisma.ordemServico.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, contactId: true, receitaId: true, valorCents: true, sinalCents: true, etapa: true },
  });
  if (!ordem) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });
  if (ordem.etapa === "CANCELADA") return NextResponse.json({ error: "OS cancelada não pode ser editada" }, { status: 409 });

  if (d.laboratorioId) {
    const lab = await prisma.laboratorio.findFirst({ where: { id: d.laboratorioId, tenantId: user.tenantId }, select: { id: true } });
    if (!lab) return NextResponse.json({ error: "laboratório não encontrado" }, { status: 404 });
  }
  const consultorId = d.consultorId === undefined ? undefined : await consultorValido(user.tenantId, d.consultorId);
  const cfg = await configDaOtica(user.tenantId);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { timezone: true } });

  const valor = d.valorCents ?? ordem.valorCents;
  const sinal = Math.min(d.sinalCents ?? ordem.sinalCents, valor);

  await prisma.$transaction(async (tx) => {
    if (d.cliente) await tx.contact.update({ where: { id: ordem.contactId }, data: dadosDoCliente(d.cliente) });

    // Receita: se só esta OS usa, corrige no lugar (foi erro de digitação).
    // Se outra OS já usou, cria uma nova — a via antiga tem que continuar
    // batendo com o que foi pedido ao laboratório naquela vez.
    let receitaId: string | null | undefined = undefined;
    if (d.receita === null) receitaId = null;
    else if (d.receita) {
      const consulta = paraData(d.receita.dataConsulta) ?? null;
      const dados = {
        usuarioNome: d.receita.usuarioNome || null,
        usuarioNascimento: paraData(d.receita.usuarioNascimento) ?? null,
        medico: d.receita.medico || null,
        crm: d.receita.crm || null,
        dataConsulta: consulta,
        validaAte: validadeDaReceita(consulta ?? new Date(), cfg.validadeReceitaMeses),
        graus: d.receita.graus,
        observacoes: d.receita.observacoes || null,
      };
      const compartilhada = ordem.receitaId
        ? (await tx.ordemServico.count({ where: { receitaId: ordem.receitaId } })) > 1
        : true;
      if (ordem.receitaId && !compartilhada) {
        await tx.receitaOtica.update({ where: { id: ordem.receitaId }, data: dados });
      } else {
        const nova = await tx.receitaOtica.create({
          data: { tenantId: user.tenantId, contactId: ordem.contactId, ...dados },
          select: { id: true },
        });
        receitaId = nova.id;
      }
    }

    await tx.ordemServico.update({
      where: { id: ordem.id },
      data: {
        receitaId,
        laboratorioId: d.laboratorioId === undefined ? undefined : d.laboratorioId || null,
        pedidoLaboratorio: d.pedidoLaboratorio === undefined ? undefined : d.pedidoLaboratorio || null,
        consultorId,
        previsaoEntrega: previsaoDaTela(d.previsao, tenant.timezone),
        lentes: d.lentes === undefined ? undefined : d.lentes || null,
        materialLente: d.materialLente === undefined ? undefined : d.materialLente || null,
        indiceLente: d.indiceLente === undefined ? undefined : d.indiceLente || null,
        tratamentos: d.tratamentos,
        tratamentoCor: d.tratamentoCor === undefined ? undefined : d.tratamentoCor || null,
        armacao: d.armacao === undefined ? undefined : d.armacao || null,
        materialArmacao: d.materialArmacao === undefined ? undefined : d.materialArmacao || null,
        servicos: d.servicos,
        medidas: d.medidas === undefined ? undefined : d.medidas ?? undefined,
        observacoes: d.observacoes === undefined ? undefined : d.observacoes || null,
        valorCents: valor,
        sinalCents: sinal,
        portadorAutorizado: d.portadorAutorizado === undefined ? undefined : d.portadorAutorizado || null,
        quitadaEm: d.quitada === undefined ? undefined : d.quitada ? new Date() : null,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
