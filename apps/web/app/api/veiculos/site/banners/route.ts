import { NextResponse } from "next/server";
import { isStorageConfigured } from "@dilon-zap/storage";
import { logAudit } from "@/lib/audit";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { criarBanner, type ArquivoDeBanner } from "@/lib/meu-site";

const comoArquivo = (f: FormDataEntryValue | null): ArquivoDeBanner | null => (f instanceof File && f.size > 0 ? { tipo: f.type, tamanho: f.size, bytes: async () => Buffer.from(await f.arrayBuffer()) } : null);

/** Banner novo: imagem do computador (obrigatória), do celular (opcional), título e link. */
export async function POST(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  if (!isStorageConfigured()) return NextResponse.json({ error: "Armazenamento de arquivos não configurado." }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const desktop = comoArquivo(form?.get("desktop") ?? null);
  if (!desktop) return NextResponse.json({ error: "envie a imagem do banner (computador)" }, { status: 400 });
  const r = await criarBanner(user.tenantId, { desktop, celular: comoArquivo(form?.get("celular") ?? null), titulo: String(form?.get("titulo") ?? ""), link: String(form?.get("link") ?? "") });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  await logAudit({ actor: user, action: "site.banner.criar" });
  return NextResponse.json(r);
}
