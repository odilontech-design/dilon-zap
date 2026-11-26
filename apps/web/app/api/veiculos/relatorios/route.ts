import { NextResponse } from "next/server";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { estoqueEmCsv, relatorioDesempenho, relatorioEstoque, relatorioIntegracao, relatorioVendas, relatorioVisitas } from "@/lib/relatorios-veiculos";

/** Veículos > Relatórios: ?tipo=estoque|visitas|integracao|desempenho|vendas (&dias=7|30|90; &formato=csv no estoque). Só a gestão. */
export async function GET(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const q = new URL(req.url).searchParams;
  const dias = [7, 30, 90].includes(Number(q.get("dias"))) ? Number(q.get("dias")) : 30;
  switch (q.get("tipo")) {
    case "visitas":
      return NextResponse.json(await relatorioVisitas(user.tenantId, dias));
    case "integracao":
      return NextResponse.json(await relatorioIntegracao(user.tenantId));
    case "vendas":
      return NextResponse.json(await relatorioVendas(user.tenantId));
    case "desempenho":
      return NextResponse.json(await relatorioDesempenho(user.tenantId, dias));
    default: {
      const r = await relatorioEstoque(user.tenantId);
      if (q.get("formato") === "csv") {
        return new NextResponse(estoqueEmCsv(r.linhas), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="estoque-${new Date().toISOString().slice(0, 10)}.csv"` } });
      }
      return NextResponse.json(r);
    }
  }
}
