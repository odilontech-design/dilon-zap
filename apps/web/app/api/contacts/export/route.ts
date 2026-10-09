import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { formatPhone } from "@/lib/contact";
import { camposDoContato, NEGOCIACAO_ABERTA_DO_CONTATO } from "@/lib/negociacoes";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET() {
  const user = await requireUser();

  const contacts = await prisma.contact.findMany({
    where: { tenantId: user.tenantId, grupo: false },
    orderBy: { createdAt: "desc" },
    include: { negociacoes: NEGOCIACAO_ABERTA_DO_CONTATO },
  });

  const header = ["nome", "telefone", "etapa", "valor", "criado_em"];
  const rows = contacts.map((c) => {
    const { stage, dealValueCents } = camposDoContato(c.negociacoes);
    return [c.name ?? "", formatPhone(c.waJid), stage?.name ?? "", (dealValueCents / 100).toFixed(2), c.createdAt.toISOString()]
      .map((v) => csvEscape(String(v)))
      .join(",");
  });
  const csv = [header.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contatos.csv"',
    },
  });
}
