import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ErroDeLeitura, LIMITE_FOTO_BYTES, TIPOS_DE_FOTO, acharPorNome, lerFotoDaOS, normalizarLeitura } from "@/lib/otica-leitura";
import { telefoneParaWhatsApp } from "@/lib/otica-schemas";

/**
 * POST /api/otica/os/ler — lê a foto de uma OS do talão de papel e devolve os
 * campos já no formato do formulário. NÃO grava nada: é uma sugestão que a
 * atendente confere e salva pelo formulário normal.
 *
 * Corpo: multipart com o campo `foto` (JPG, PNG ou WEBP, até 8 MB).
 */

// Um pedido por vez por empresa, com um respiro entre eles: a camada gratuita da
// IA tem limite de pedidos por minuto, e uma tela travada num laço não pode gastá-lo.
const ultimaLeitura = new Map<string, number>();
const INTERVALO_MS = 2500;

export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const agora = Date.now();
  if (agora - (ultimaLeitura.get(user.tenantId) ?? 0) < INTERVALO_MS) {
    return NextResponse.json({ error: "Espere alguns segundos entre uma foto e outra." }, { status: 429 });
  }
  ultimaLeitura.set(user.tenantId, agora);

  const form = await req.formData().catch(() => null);
  const foto = form?.get("foto");
  if (!(foto instanceof File)) return NextResponse.json({ error: "envie a foto no campo foto" }, { status: 400 });
  if (!TIPOS_DE_FOTO.includes(foto.type)) return NextResponse.json({ error: "use uma foto JPG, PNG ou WEBP" }, { status: 400 });
  if (foto.size > LIMITE_FOTO_BYTES) return NextResponse.json({ error: "a foto passa de 8 MB" }, { status: 400 });

  let bruto: unknown;
  try {
    bruto = await lerFotoDaOS({ base64: Buffer.from(await foto.arrayBuffer()).toString("base64"), mime: foto.type }, { signal: AbortSignal.timeout(45_000) });
  } catch (e) {
    if (e instanceof ErroDeLeitura) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.name === "TimeoutError") return NextResponse.json({ error: "A leitura demorou demais. Tente de novo." }, { status: 504 });
    throw e;
  }
  const { leitura, avisos, duvidas } = normalizarLeitura(bruto);

  // Casa o que foi lido com o que já existe: laboratório, consultor e cliente.
  const [laboratorios, equipe] = await Promise.all([
    prisma.laboratorio.findMany({ where: { tenantId: user.tenantId, ativo: true }, select: { id: true, nome: true } }),
    prisma.user.findMany({ where: { tenantId: user.tenantId, role: { not: "SUPERADMIN" } }, select: { id: true, name: true } }),
  ]);
  const lab = leitura.laboratorioNome ? acharPorNome(laboratorios, leitura.laboratorioNome) : null;
  const consultor = leitura.consultorNome ? acharPorNome(equipe.map((u) => ({ id: u.id, nome: u.name })), leitura.consultorNome) : null;
  if (leitura.laboratorioNome && !lab) avisos.push(`Laboratório "${leitura.laboratorioNome}" não está cadastrado: escolha na lista ou cadastre em Laboratórios e avisos.`);

  const digitos = telefoneParaWhatsApp(leitura.cliente.telefone);
  const cpf = leitura.cliente.documento.replace(/\D/g, "");
  const contato =
    digitos.length >= 10 || cpf.length === 11
      ? await prisma.contact.findFirst({
          where: {
            tenantId: user.tenantId,
            OR: [...(digitos.length >= 10 ? [{ phoneNumber: { endsWith: digitos.slice(-9) } }] : []), ...(cpf.length === 11 ? [{ documento: { contains: cpf } }] : [])],
          },
          select: { id: true, name: true, phoneNumber: true },
        })
      : null;

  return NextResponse.json({
    leitura,
    avisos,
    duvidas,
    laboratorioId: lab?.id ?? null,
    consultorId: consultor?.id ?? null,
    contato: contato ? { id: contato.id, nome: contato.name, telefone: contato.phoneNumber } : null,
  });
}
