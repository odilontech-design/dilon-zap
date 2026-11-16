import { NextResponse } from "next/server";
import { lojaPublica } from "@/lib/vitrine";
import { ehRobo, registrarEventoDoSite } from "@/lib/estatisticas-vitrine";

/** Freio simples por IP: uma pessoa navegando não passa disso; robô insistente para de contar. */
const porIp = new Map<string, number[]>();
function dentroDoLimite(ip: string, agora = Date.now()) {
  const recentes = (porIp.get(ip) ?? []).filter((t) => agora - t < 3_600_000);
  if (recentes.length >= 300) return false;
  recentes.push(agora);
  porIp.set(ip, recentes);
  if (porIp.size > 20_000) porIp.clear();
  return true;
}

/** Visita ou clique no WhatsApp no site da loja (contagem para os relatórios). Sem login; responde sempre 204. */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const vazio = new NextResponse(null, { status: 204 });
  if (ehRobo(req.headers.get("user-agent"))) return vazio;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
  if (!dentroDoLimite(ip)) return vazio;
  const corpo = (await req.json().catch(() => null)) as { tipo?: string; veiculoId?: string } | null;
  const tipo = corpo?.tipo === "whatsapp" ? "whatsapp" : corpo?.tipo === "visita" ? "visita" : null;
  if (!tipo) return vazio;
  const loja = await lojaPublica(params.slug);
  if (!loja) return vazio;
  const veiculoId = typeof corpo?.veiculoId === "string" && /^[a-z0-9]{10,40}$/.test(corpo.veiculoId) ? corpo.veiculoId : null;
  await registrarEventoDoSite(loja.tenantId, veiculoId, tipo).catch(() => {});
  return vazio;
}
