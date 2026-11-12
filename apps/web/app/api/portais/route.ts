import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { soDigitos, telefoneValido } from "@dilon-zap/portais";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { painelPortais } from "@/lib/portais";

async function gestao() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return { bloqueio };
  if (!ehGerencia(user.role)) return { bloqueio: NextResponse.json({ error: "só a gestão cuida dos portais" }, { status: 403 }) };
  return { user };
}

/** Painel dos portais: conta conectada, dados dos anúncios e o que está com problema. */
export async function GET() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  return NextResponse.json(await painelPortais(user.tenantId));
}

const corpo = z.object({
  cep: z.string().trim().max(12).nullable(),
  telefone: z.string().trim().max(20).nullable(),
});

/** CEP e telefone que vão em todo anúncio (a OLX exige os dois). */
export async function PUT(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const parsed = corpo.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const cep = parsed.data.cep ? soDigitos(parsed.data.cep) : null;
  const telefone = parsed.data.telefone ? soDigitos(parsed.data.telefone) : null;
  if (cep && cep.length !== 8) return NextResponse.json({ error: "CEP precisa ter 8 dígitos" }, { status: 400 });
  if (telefone && !telefoneValido(telefone)) return NextResponse.json({ error: "telefone precisa ter DDD (10 ou 11 dígitos)" }, { status: 400 });
  await prisma.veiculosConfig.upsert({
    where: { tenantId: user.tenantId },
    create: { tenantId: user.tenantId, cepAnuncios: cep, telefoneAnuncios: telefone },
    update: { cepAnuncios: cep, telefoneAnuncios: telefone },
  });
  return NextResponse.json({ ok: true });
}
