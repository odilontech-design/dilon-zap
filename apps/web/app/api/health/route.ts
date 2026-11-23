import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";

export const dynamic = "force-dynamic";

/**
 * Saúde do site, para monitor de disponibilidade e para conferir um deploy: responde a versão e se o
 * banco está respondendo. Público e sem dado de nenhuma empresa. Erro do banco devolve 503, sem
 * detalhe do erro (que pode ter endereço do servidor).
 */
export async function GET() {
  const inicio = Date.now();
  let banco = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    banco = false;
  }
  return NextResponse.json(
    { status: banco ? "ok" : "erro", versao: process.env.NEXT_PUBLIC_APP_VERSION ?? "?", banco: banco ? "ok" : "fora", ms: Date.now() - inicio },
    { status: banco ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
