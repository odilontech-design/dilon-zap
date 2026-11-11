import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/session";
import { validarMes } from "@/lib/datas";
import { gerarRelatorio, paraCsv, RELATORIOS, type TipoRelatorio } from "@/lib/relatorios";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { tipo: string } }) {
  const u = await usuarioAtual();
  if (!u || u.papel !== "ADMIN") return new NextResponse("sem permissão", { status: 403 });
  if (!(params.tipo in RELATORIOS)) return new NextResponse("relatório desconhecido", { status: 404 });

  const mes = validarMes(new URL(req.url).searchParams.get("mes") ?? undefined, u.empresa.timezone);
  const csv = paraCsv(await gerarRelatorio(params.tipo as TipoRelatorio, u.empresaId, mes));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ponto-${params.tipo}-${mes}.csv"`,
    },
  });
}
