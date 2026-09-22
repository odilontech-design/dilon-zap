import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia, isStorageConfigured } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { classificarMaterial, validarMaterial } from "@/lib/materiais";

// Mesma regra de quem edita o catálogo (ver ../route.ts): a biblioteca é
// parte do cadastro do produto, e a reunião de 21/09 restringiu isso aos
// responsáveis. Enviar material na conversa, qualquer um pode.
function podeEditar(role: string) {
  return role === "OWNER" || role === "FINANCEIRO";
}

async function produtoDoTenant(id: string, tenantId: string) {
  return prisma.product.findFirst({ where: { id, tenantId }, select: { id: true } });
}

/** GET /api/products/[id]/materiais — arquivos da biblioteca deste produto. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "MATERIAIS");
  if (bloqueio) return bloqueio;

  const produto = await produtoDoTenant(params.id, user.tenantId);
  if (!produto) return NextResponse.json({ error: "produto não encontrado" }, { status: 404 });

  const materiais = await prisma.produtoMaterial.findMany({
    where: { productId: produto.id },
    orderBy: { criadoEm: "asc" },
    select: { id: true, titulo: true, mediaType: true, fileName: true, tamanhoBytes: true, duracaoSegundos: true },
  });
  return NextResponse.json(materiais);
}

/**
 * POST /api/products/[id]/materiais — sobe um arquivo pra biblioteca.
 *
 * multipart: file, titulo (opcional — cai no nome do arquivo) e
 * duracaoSegundos (vídeo; medido pelo navegador antes de subir).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "MATERIAIS");
  if (bloqueio) return bloqueio;
  if (!podeEditar(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Armazenamento de arquivos não configurado." }, { status: 503 });
  }

  const produto = await produtoDoTenant(params.id, user.tenantId);
  if (!produto) return NextResponse.json({ error: "produto não encontrado" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "arquivo é obrigatório" }, { status: 400 });

  const duracaoBruta = form.get("duracaoSegundos");
  const duracaoSegundos = typeof duracaoBruta === "string" && duracaoBruta !== "" ? Number(duracaoBruta) : null;
  const mimeType = file.type || "application/octet-stream";

  const erro = validarMaterial({
    mimeType,
    tamanhoBytes: file.size,
    duracaoSegundos: Number.isFinite(duracaoSegundos) ? duracaoSegundos : null,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });

  const tipo = classificarMaterial(mimeType)!;
  const extensao = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  // Pasta própria da biblioteca, fora das conversas: o arquivo não pertence a
  // atendimento nenhum, e é reaproveitado em todos os envios.
  const key = `${user.tenantId}/materiais/${produto.id}/${randomUUID()}${extensao}`;
  await uploadMedia(key, Buffer.from(await file.arrayBuffer()), mimeType);

  const tituloBruto = form.get("titulo");
  const titulo =
    (typeof tituloBruto === "string" && tituloBruto.trim().slice(0, 120)) ||
    file.name.replace(/\.[^.]+$/, "").slice(0, 120) ||
    "Material";

  const material = await prisma.produtoMaterial.create({
    data: {
      tenantId: user.tenantId,
      productId: produto.id,
      titulo,
      mediaKey: key,
      mediaType: tipo,
      mimeType,
      fileName: file.name || titulo,
      tamanhoBytes: file.size,
      duracaoSegundos: tipo === "VIDEO" && duracaoSegundos != null ? Math.round(duracaoSegundos) : null,
    },
    select: { id: true, titulo: true, mediaType: true, fileName: true, tamanhoBytes: true, duracaoSegundos: true },
  });
  return NextResponse.json(material);
}
