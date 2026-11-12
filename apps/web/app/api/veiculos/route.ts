import { NextResponse } from "next/server";
import { prisma, type Prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { entradaVeiculoSchema } from "@/lib/veiculos-schemas";
import { registrarEntrada, resolverCliente } from "@/lib/veiculos";
import { STATUS_NO_PATIO, custoTotal, diasEmEstoque, margem, normalizarPlaca, type StatusVeiculo } from "@/lib/veiculos-regras";
import { SEM_PERMISSAO, respostaDeErro } from "@/lib/veiculos-api";
import { patioDoPlano } from "@/lib/veiculos";
import { PLANOS_VEICULOS } from "@/lib/veiculos-planos";

/**
 * O estoque. Sem filtro, traz o que está no pátio (preparação, disponível,
 * reservado). `status=VENDIDO` ou `DEVOLVIDO` lista a saída, mais recente
 * primeiro. Custo e margem só vão para a gestão.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const statusPedido = url.searchParams.get("status") as StatusVeiculo | null;
  const gerencia = ehGerencia(user.role);

  const where: Prisma.VeiculoWhereInput = { tenantId: user.tenantId };
  if (statusPedido === "VENDIDO" || statusPedido === "DEVOLVIDO") where.status = statusPedido;
  else if (statusPedido && STATUS_NO_PATIO.includes(statusPedido)) where.status = statusPedido;
  else if (!q) where.status = { in: STATUS_NO_PATIO };
  if (q) {
    const placa = normalizarPlaca(q);
    where.OR = [
      { marca: { contains: q, mode: "insensitive" } },
      { modelo: { contains: q, mode: "insensitive" } },
      { versao: { contains: q, mode: "insensitive" } },
      ...(placa && placa.length >= 3 ? [{ placa: { contains: placa } }] : []),
    ];
  }

  const saida = where.status === "VENDIDO" || where.status === "DEVOLVIDO";
  const veiculos = await prisma.veiculo.findMany({
    where,
    orderBy: saida ? { saidaEm: "desc" } : { entradaEm: "asc" },
    take: saida || q ? 200 : 1000,
    select: {
      id: true,
      tipo: true,
      placa: true,
      marca: true,
      modelo: true,
      versao: true,
      anoFabricacao: true,
      anoModelo: true,
      km: true,
      kmInformado: true,
      cor: true,
      cambio: true,
      combustivel: true,
      precoCents: true,
      fipeCents: true,
      status: true,
      origem: true,
      entradaEm: true,
      saidaEm: true,
      consignacaoValorCents: true,
      custos: { select: { valorCents: true } },
      fotos: { orderBy: { ordem: "asc" }, take: 1, select: { id: true } },
      _count: { select: { fotos: true } },
      vendas: { where: { status: { not: "CANCELADA" } }, orderBy: { createdAt: "desc" }, take: 1, select: { precoCents: true, comissaoCents: true, reservadaAte: true, contact: { select: { name: true, waName: true } } } },
    },
  });

  const agora = new Date();
  const patio = await patioDoPlano(prisma, user.tenantId);
  return NextResponse.json({
    gerencia,
    plano: patio.plano ? { nome: PLANOS_VEICULOS[patio.plano].nome, limite: PLANOS_VEICULOS[patio.plano].carrosNoPatio, noPatio: patio.noPatio } : null,
    veiculos: veiculos.map(({ custos, fotos, _count, consignacaoValorCents, vendas, ...v }) => {
      const custo = custoTotal(custos.map((c) => c.valorCents), consignacaoValorCents);
      const venda = vendas[0] ?? null;
      const preco = v.status === "VENDIDO" && venda ? venda.precoCents : v.precoCents;
      return {
        ...v,
        dias: diasEmEstoque(v.entradaEm, v.saidaEm, agora),
        capaId: fotos[0]?.id ?? null,
        totalFotos: _count.fotos,
        cliente: venda ? venda.contact.name ?? venda.contact.waName : null,
        reservadaAte: v.status === "RESERVADO" ? venda?.reservadaAte ?? null : null,
        ...(gerencia ? { custoCents: custo, margem: margem(preco, custo, v.status === "VENDIDO" ? venda?.comissaoCents ?? 0 : 0) } : {}),
      };
    }),
  });
}

/** Entrada de um carro no estoque (compra ou consignação). Só a gestão: mexe em contas a pagar. */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const parsed = entradaVeiculoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const consignanteId = parsed.data.origem === "CONSIGNACAO" && parsed.data.consignacao ? await resolverCliente(user.tenantId, parsed.data.consignacao.dono) : null;
    const v = await registrarEntrada({ tenantId: user.tenantId, userId: user.id, dados: parsed.data, consignanteId });
    await logAudit({ actor: user, action: "veiculo.entrada", metadata: { veiculoId: v.id, origem: parsed.data.origem } });
    return NextResponse.json(v, { status: 201 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
