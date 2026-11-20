import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/ponto-db";

export const dynamic = "force-dynamic";

/** Diagnóstico de instalação: o banco responde e as tabelas existem? */
export async function GET() {
  try {
    const empresas = await prisma.empresa.count();
    return NextResponse.json({ ok: true, banco: "ok", empresas, versao: process.env.NEXT_PUBLIC_APP_VERSION });
  } catch (err) {
    return NextResponse.json({ ok: false, banco: String((err as Error).message).slice(0, 300) }, { status: 503 });
  }
}
