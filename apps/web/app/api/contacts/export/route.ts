import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { formatPhone } from "@/lib/contact";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET() {
  const user = await requireUser();

  const contacts = await prisma.contact.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    include: { stage: { select: { name: true } } },
  });

  const header = ["nome", "telefone", "etapa", "valor", "criado_em"];
  const rows = contacts.map((c) =>
    [c.name ?? "", formatPhone(c.waJid), c.stage?.name ?? "", (c.dealValueCents / 100).toFixed(2), c.createdAt.toISOString()]
      .map((v) => csvEscape(String(v)))
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contatos.csv"',
    },
  });
}
