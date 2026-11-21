import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/session";
import { gerarAejDaEmpresa, gerarAfdDaEmpresa } from "@/lib/rep-arquivos";
import { hojeNoFuso } from "@/lib/datas";
import { auditar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * AFD (art. 81) e AEJ (art. 83) do período, e a assinatura .p7s de cada um.
 *   /api/rep/afd?de=2026-11-01&ate=2026-11-30            → arquivo .txt
 *   /api/rep/afd?de=...&ate=...&formato=p7s              → assinatura CAdES
 *
 * NÃO passa pelo bloqueio por mensalidade: entregar esses arquivos ao
 * Auditor-Fiscal do Trabalho é obrigação do empregador (art. 81, § 2º, e
 * art. 85), e o sistema não pode ser o motivo de ele descumprir.
 */
export async function GET(req: Request, { params }: { params: { arquivo: string } }) {
  const u = await usuarioAtual();
  if (!u || u.papel !== "ADMIN") return new NextResponse("sem permissão", { status: 403 });
  if (params.arquivo !== "afd" && params.arquivo !== "aej") return new NextResponse("arquivo desconhecido", { status: 404 });

  const url = new URL(req.url);
  const hoje = hojeNoFuso(u.empresa.timezone);
  const de = url.searchParams.get("de") ?? `${hoje.slice(0, 7)}-01`;
  const ate = url.searchParams.get("ate") ?? hoje;
  if (!DATA.test(de) || !DATA.test(ate) || de > ate) return new NextResponse("período inválido", { status: 400 });

  const arquivo = params.arquivo === "afd" ? await gerarAfdDaEmpresa(u.empresaId, de, ate) : await gerarAejDaEmpresa(u.empresaId, de, ate);
  await auditar(u, `baixar_${params.arquivo}`, "Empresa", u.empresaId, { de, ate, formato: url.searchParams.get("formato") ?? "txt" });

  if (url.searchParams.get("formato") === "p7s") {
    if (!arquivo.p7s) return new NextResponse("certificado digital não configurado", { status: 409 });
    return new NextResponse(new Uint8Array(arquivo.p7s), {
      headers: {
        "Content-Type": "application/pkcs7-signature",
        "Content-Disposition": `attachment; filename="${arquivo.nome}.p7s"`,
      },
    });
  }
  return new NextResponse(new Uint8Array(arquivo.conteudo), {
    headers: {
      "Content-Type": "text/plain; charset=ISO-8859-1",
      "Content-Disposition": `attachment; filename="${arquivo.nome}"`,
    },
  });
}
