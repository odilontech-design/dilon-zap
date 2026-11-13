import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import { registrarEvento } from "@/lib/veiculos";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

const corpo = z.union([z.object({ todos: z.literal(true) }), z.object({ ids: z.array(z.string()).min(1).max(500) })]);

/**
 * Coloca à venda, de uma vez, os carros em preparação. As mesmas regras da
 * ficha valem para cada um: sem preço (e sem km, se a loja exige) o carro não
 * vai e volta na resposta com o motivo, sem barrar os demais.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });

  const exigirKm = (await prisma.veiculosConfig.findUnique({ where: { tenantId: user.tenantId }, select: { exigirKm: true } }))?.exigirKm ?? true;
  const carros = await prisma.veiculo.findMany({
    where: { tenantId: user.tenantId, status: "PREPARACAO", ...("todos" in parsed.data ? {} : { id: { in: parsed.data.ids } }) },
    select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, precoCents: true, kmInformado: true },
    take: 500,
  });

  const prontos: string[] = [];
  const ignorados: { id: string; nome: string; motivo: string }[] = [];
  for (const c of carros) {
    const faltas = [c.precoCents <= 0 && "o preço", exigirKm && !c.kmInformado && "a quilometragem"].filter(Boolean);
    if (faltas.length) ignorados.push({ id: c.id, nome: nomeDoVeiculo(c), motivo: `falta ${faltas.join(" e ")}` });
    else prontos.push(c.id);
  }
  if (prontos.length) {
    await prisma.$transaction(async (tx) => {
      await tx.veiculo.updateMany({ where: { id: { in: prontos }, tenantId: user.tenantId, status: "PREPARACAO" }, data: { status: "DISPONIVEL", statusDesde: new Date() } });
      for (const id of prontos) await registrarEvento(tx, id, "status", "Em preparação → Disponível (em lote)", user.id);
    });
    await logAudit({ actor: user, action: "veiculo.colocar-a-venda-lote", metadata: { quantidade: prontos.length } });
  }
  return NextResponse.json({ colocados: prontos.length, ignorados });
}
