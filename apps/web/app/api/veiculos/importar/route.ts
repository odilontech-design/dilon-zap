import { NextResponse } from "next/server";
import { z } from "zod";
import { lerCsv, ErroSdrCore } from "@dilon-zap/sdr-core";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { lerPlanilha } from "@/lib/veiculos-importacao";
import { importarEstoque } from "@/lib/veiculos";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

const corpo = z.object({ texto: z.string().min(1).max(6_000_000), simular: z.boolean() });

/**
 * Importa o estoque de uma planilha (CSV). Em dois tempos: `simular: true`
 * mostra o que entra, o que já está no estoque e as linhas com problema;
 * `simular: false` grava. Linha ruim não impede as boas. Só a gestão.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const parsed = corpo.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "envie o conteúdo da planilha" }, { status: 400 });

  let csv;
  try {
    csv = lerCsv(parsed.data.texto);
  } catch (e) {
    if (e instanceof ErroSdrCore) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  if (csv.linhas.length > 2000) return NextResponse.json({ error: "a planilha passa de 2.000 carros: divida em partes" }, { status: 400 });

  const lida = lerPlanilha(csv.cabecalho, csv.linhas);
  if (lida.faltando.length) {
    return NextResponse.json(
      { error: `a planilha precisa das colunas: ${lida.faltando.join(", ")}`, faltando: lida.faltando, cabecalho: csv.cabecalho },
      { status: 400 }
    );
  }
  const r = await importarEstoque({ tenantId: user.tenantId, userId: user.id, linhas: lida.linhas, simular: parsed.data.simular });
  if (!parsed.data.simular) await logAudit({ actor: user, action: "veiculos.importar", metadata: { criados: r.criados, fotos: r.fotos } });

  return NextResponse.json({
    ...r,
    lidas: csv.linhas.length,
    erros: lida.erros,
    ignoradas: lida.ignoradas,
    previa: lida.linhas.slice(0, 8).map((l) => ({
      numero: l.numero,
      nome: `${l.marca} ${l.modelo}${l.versao ? ` ${l.versao}` : ""} ${l.anoFabricacao}/${l.anoModelo}`,
      km: l.km,
      placa: l.placa,
      precoCents: l.precoCents,
      custoCents: l.custoCents,
      fotos: l.fotos.length,
    })),
  });
}
