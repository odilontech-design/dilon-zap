import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

// A semana inteira vai e volta de uma vez, em vez de CRUD linha a linha:
// horário é editado como um bloco só ("seg a sex 8-18, sábado meio período"),
// e salvar dia a dia deixaria o atendimento num estado meio-configurado entre
// um POST e o outro — com o worker já lendo, isso mandaria mensagem de
// ausência em horário comercial.
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const bodySchema = z.object({
  outOfHoursMessage: z.string().max(4096).nullable(),
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        isOpen: z.boolean(),
        opensAt: z.string().regex(HORA, "use HH:MM"),
        closesAt: z.string().regex(HORA, "use HH:MM"),
      })
    )
    .length(7),
});

const PADRAO = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  // Domingo e sábado fechados por padrão — é o caso comum, e deixar tudo
  // aberto faria a mensagem de ausência nunca disparar sem ninguém entender.
  isOpen: weekday >= 1 && weekday <= 5,
  opensAt: "08:00",
  closesAt: "18:00",
}));

export async function GET() {
  const user = await requireUser();

  const [tenant, horarios] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { timezone: true, outOfHoursMessage: true },
    }),
    prisma.businessHour.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { weekday: "asc" },
    }),
  ]);

  // Preenche os dias que ainda não existem com o padrão, pra tela sempre
  // receber os 7 e não precisar saber que o banco pode estar vazio.
  const porDia = new Map(horarios.map((h) => [h.weekday, h]));
  const days = PADRAO.map((p) => {
    const salvo = porDia.get(p.weekday);
    return salvo
      ? { weekday: salvo.weekday, isOpen: salvo.isOpen, opensAt: salvo.opensAt, closesAt: salvo.closesAt }
      : p;
  });

  return NextResponse.json({
    timezone: tenant.timezone,
    outOfHoursMessage: tenant.outOfHoursMessage,
    days,
  });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  if (user.role === "AGENT") {
    return NextResponse.json({ error: "só o responsável pela conta pode mudar o horário" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const invalido = parsed.data.days.find((d) => d.isOpen && d.closesAt <= d.opensAt);
  if (invalido) {
    return NextResponse.json(
      { error: `o horário de fechamento precisa ser depois do de abertura (dia ${invalido.weekday})` },
      { status: 400 }
    );
  }

  const mensagem = parsed.data.outOfHoursMessage?.trim() || null;

  await prisma.$transaction([
    prisma.tenant.update({
      where: { id: user.tenantId },
      data: { outOfHoursMessage: mensagem },
    }),
    ...parsed.data.days.map((d) =>
      prisma.businessHour.upsert({
        where: { tenantId_weekday: { tenantId: user.tenantId, weekday: d.weekday } },
        create: { tenantId: user.tenantId, ...d },
        update: { isOpen: d.isOpen, opensAt: d.opensAt, closesAt: d.closesAt },
      })
    ),
  ]);

  await logAudit({
    actor: user,
    action: "businessHours.update",
    metadata: { days: parsed.data.days, temMensagem: Boolean(mensagem) },
  });

  return NextResponse.json({ ok: true });
}
