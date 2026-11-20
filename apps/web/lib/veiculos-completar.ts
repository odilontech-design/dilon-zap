import { prisma } from "@dilon-zap/db";
import { registrarEvento } from "@/lib/veiculos";

export type ItemCompletar = { id: string; km?: number; precoCents?: number };

/**
 * Grava km e preço de vários carros. Km informada (inclusive 0) marca o carro
 * como "km informada"; com `colocarAVenda`, o que está em preparação e ficou com
 * preço (e km, se a loja exige) passa a disponível. Tudo vai para o histórico do carro.
 */
export async function completarEstoque(tenantId: string, userId: string, itens: ItemCompletar[], colocarAVenda: boolean) {
  const exigirKm = (await prisma.veiculosConfig.findUnique({ where: { tenantId: tenantId }, select: { exigirKm: true } }))?.exigirKm ?? true;
  const carros = await prisma.veiculo.findMany({
    where: { tenantId: tenantId, id: { in: itens.map((i) => i.id) }, status: { in: ["PREPARACAO", "DISPONIVEL", "RESERVADO"] } },
    select: { id: true, status: true, km: true, kmInformado: true, precoCents: true },
  });
  const porId = new Map(carros.map((c) => [c.id, c]));
  const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  let salvos = 0;
  let colocados = 0;
  const pulados: string[] = [];
  for (const item of itens) {
    const c = porId.get(item.id);
    if (!c || (item.km === undefined && item.precoCents === undefined)) {
      pulados.push(item.id);
      continue;
    }
    const kmFinal = item.km ?? c.km;
    const kmOk = c.kmInformado || item.km !== undefined;
    const precoFinal = item.precoCents ?? c.precoCents;
    const vai = colocarAVenda && c.status === "PREPARACAO" && precoFinal > 0 && (kmOk || !exigirKm);
    await prisma.$transaction(async (tx) => {
      await tx.veiculo.update({
        where: { id: c.id },
        data: {
          ...(item.km !== undefined ? { km: item.km, kmInformado: true } : {}),
          ...(item.precoCents !== undefined ? { precoCents: item.precoCents } : {}),
          ...(vai ? { status: "DISPONIVEL", statusDesde: new Date() } : {}),
        },
      });
      if (item.km !== undefined && item.km !== c.km) await registrarEvento(tx, c.id, "km", `Quilometragem ${c.kmInformado ? `${c.km.toLocaleString("pt-BR")} km` : "não informada"} → ${kmFinal.toLocaleString("pt-BR")} km`, userId);
      else if (item.km !== undefined && !c.kmInformado) await registrarEvento(tx, c.id, "km", `Quilometragem informada: ${kmFinal.toLocaleString("pt-BR")} km`, userId);
      if (item.precoCents !== undefined && item.precoCents !== c.precoCents) await registrarEvento(tx, c.id, "preco", `Preço ${brl(c.precoCents)} → ${brl(item.precoCents)}`, userId);
      if (vai) await registrarEvento(tx, c.id, "status", "Em preparação → Disponível (completar em lote)", userId);
    });
    salvos++;
    if (vai) colocados++;
  }
  return { salvos, colocados, pulados: pulados.length };
}
