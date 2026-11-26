import { NextResponse } from "next/server";
import { z } from "zod";
import { gestaoDosPortais } from "@/lib/portais-api";
import { salvarVersoesNapista, versoesPendentesNapista } from "@/lib/portais-napista";
import { logAudit } from "@/lib/audit";

const erroDoPortal = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : "o NaPista não respondeu" }, { status: 502 });

/**
 * Carros ligados ao NaPista que ainda esperam a escolha da versão no catálogo, com as opções
 * (e a mais parecida marcada). Só leitura; pagina por `deslocar`. Só a gestão, sempre da loja da sessão.
 */
export async function GET(req: Request) {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  const q = new URL(req.url).searchParams;
  const limite = Math.min(Math.max(Number(q.get("limite")) || 12, 1), 20);
  const deslocar = Math.max(Number(q.get("deslocar")) || 0, 0);
  try {
    const r = await versoesPendentesNapista(user.tenantId, limite, deslocar);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "conecte o NaPista primeiro" }, { status: 409 });
  } catch (e) {
    return erroDoPortal(e);
  }
}

const corpo = z.object({ escolhas: z.array(z.object({ veiculoId: z.string().min(1).max(40), versaoId: z.string().min(1).max(80) })).min(1).max(100) });

/** Guarda as versões escolhidas e devolve os carros à fila de publicação. */
export async function POST(req: Request) {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  try {
    const r = await salvarVersoesNapista(user.tenantId, parsed.data.escolhas);
    if (!r) return NextResponse.json({ error: "conecte o NaPista primeiro" }, { status: 409 });
    await logAudit({ actor: user, action: "napista.escolher-versoes", metadata: { salvas: r.salvas, recusadas: r.recusadas.length } });
    return NextResponse.json(r);
  } catch (e) {
    return erroDoPortal(e);
  }
}
