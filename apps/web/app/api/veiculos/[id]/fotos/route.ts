import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { uploadMedia, isStorageConfigured } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { registrarEvento } from "@/lib/veiculos";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

/**
 * Fotos do carro. Várias de uma vez (o vendedor fotografa o carro inteiro no
 * pátio e sobe tudo). Mesmo desenho da foto de produto: arquivo no R2, chave
 * no banco, leitura por URL assinada em /api/veiculos/fotos/[fotoId].
 */

// Foto de celular atual passa de 5MB; 10MB cobre sem aceitar o RAW da câmera.
const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const TIPOS = ["image/png", "image/jpeg", "image/webp"];
// Portal nenhum aceita mais que isso, e é o que cabe mandar no WhatsApp.
const MAXIMO_POR_CARRO = 40;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();
  if (!isStorageConfigured()) return NextResponse.json({ error: "Armazenamento de arquivos não configurado." }, { status: 503 });

  const v = await prisma.veiculo.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, _count: { select: { fotos: true } }, fotos: { orderBy: { ordem: "desc" }, take: 1, select: { ordem: true } } },
  });
  if (!v) return NextResponse.json({ error: "veículo não encontrado" }, { status: 404 });

  const form = await req.formData();
  const arquivos = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!arquivos.length) return NextResponse.json({ error: "escolha ao menos uma foto" }, { status: 400 });
  if (v._count.fotos + arquivos.length > MAXIMO_POR_CARRO) {
    return NextResponse.json({ error: `cada carro tem no máximo ${MAXIMO_POR_CARRO} fotos (já tem ${v._count.fotos})` }, { status: 400 });
  }
  for (const f of arquivos) {
    if (f.size > TAMANHO_MAXIMO) return NextResponse.json({ error: `${f.name}: maior que 10MB` }, { status: 400 });
    if (!TIPOS.includes(f.type)) return NextResponse.json({ error: `${f.name}: use PNG, JPG ou WEBP` }, { status: 400 });
  }

  let ordem = (v.fotos[0]?.ordem ?? -1) + 1;
  const criadas: string[] = [];
  for (const f of arquivos) {
    const ext = f.type.split("/")[1].replace("jpeg", "jpg");
    const key = `${user.tenantId}/veiculos/${v.id}/${randomUUID().slice(0, 12)}.${ext}`;
    await uploadMedia(key, Buffer.from(await f.arrayBuffer()), f.type);
    const foto = await prisma.fotoVeiculo.create({ data: { tenantId: user.tenantId, veiculoId: v.id, key, ordem: ordem++ }, select: { id: true } });
    criadas.push(foto.id);
  }
  await registrarEvento(prisma, v.id, "fotos", `${criadas.length} foto(s) adicionada(s)`, user.id);
  return NextResponse.json({ ids: criadas }, { status: 201 });
}

/** Nova ordem das fotos (a primeira é a capa). Manda a lista inteira de ids. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const parsed = z.object({ ordem: z.array(z.string().min(1)).max(100) }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "lista de fotos inválida" }, { status: 400 });

  const fotos = await prisma.fotoVeiculo.findMany({ where: { veiculoId: params.id, tenantId: user.tenantId }, select: { id: true } });
  const delas = new Set(fotos.map((f) => f.id));
  if (parsed.data.ordem.length !== delas.size || parsed.data.ordem.some((id) => !delas.has(id))) {
    return NextResponse.json({ error: "a lista não bate com as fotos do carro: recarregue a página" }, { status: 409 });
  }
  await prisma.$transaction(parsed.data.ordem.map((id, i) => prisma.fotoVeiculo.update({ where: { id }, data: { ordem: i } })));
  return NextResponse.json({ ok: true });
}
