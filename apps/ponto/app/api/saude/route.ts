import { certificadoConfigurado } from "@/lib/assinatura";
import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/ponto-db";
import { pendenciasDoRep } from "@/lib/rep-arquivos";
import { conferirRelogio } from "@/lib/relogio";

export const dynamic = "force-dynamic";

/** Diagnóstico de instalação: o banco responde e as tabelas existem? */
export async function GET() {
  try {
    const empresas = await prisma.empresa.count();
    const relogio = await conferirRelogio();
    return NextResponse.json({
      ok: true,
      banco: "ok",
      empresas,
      versao: process.env.NEXT_PUBLIC_APP_VERSION,
      // Para a equipe da Dilon conferir a instalação do REP-P (sem segredos).
      repP: { pendencias: pendenciasDoRep(), certificadoValidoAte: certificadoConfigurado()?.validoAte.toISOString().slice(0, 10) ?? null, relogio: { diferencaS: relogio.diferencaS, dentroDoLimite: relogio.dentroDoLimite } },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, banco: String((err as Error).message).slice(0, 300) }, { status: 503 });
  }
}
