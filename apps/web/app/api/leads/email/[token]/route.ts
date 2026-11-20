import { NextResponse } from "next/server";
import { registrarEmailDeLead, tenantDoToken } from "@/lib/lead-email";

export const runtime = "nodejs";

/** Tamanho máximo do e-mail aceito (anexos grandes não interessam). */
const MAX_BYTES = 2_000_000;

/**
 * Entrada dos e-mails de lead dos portais. Um endereço por loja (o token na
 * URL). Aceita o e-mail bruto (message/rfc822 ou text/plain, como o Cloudflare
 * Email Routing e o Mailgun "forward" entregam) ou JSON com `raw` (o RFC 822
 * completo) ou com `from`, `subject`, `text`/`html` quando o provedor já
 * entrega o e-mail separado em campos. Sem login, como todo webhook: a defesa
 * é o token.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const tenantId = await tenantDoToken(params.token);
  if (!tenantId) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const tipo = req.headers.get("content-type") ?? "";
  let raw: string;
  try {
    if (tipo.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>;
      if (typeof j.raw === "string") raw = j.raw;
      else {
        const texto = String(j.text ?? j.TextBody ?? "");
        const html = String(j.html ?? j.HtmlBody ?? "");
        const cab = [`From: ${String(j.from ?? j.From ?? "")}`, `Subject: ${String(j.subject ?? j.Subject ?? "")}`, `Message-ID: ${String(j.messageId ?? j.MessageID ?? "")}`, `Date: ${String(j.date ?? j.Date ?? new Date().toUTCString())}`, "MIME-Version: 1.0"];
        raw = html && !texto ? [...cab, "Content-Type: text/html; charset=utf-8", "", html].join("\r\n") : [...cab, "Content-Type: text/plain; charset=utf-8", "", texto].join("\r\n");
      }
    } else {
      raw = await req.text();
    }
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  if (!raw.trim() || raw.length > MAX_BYTES) return NextResponse.json({ error: "e-mail vazio ou grande demais" }, { status: 400 });

  try {
    return NextResponse.json({ ok: true, ...(await registrarEmailDeLead(tenantId, raw)) });
  } catch (e) {
    console.error("[leads] e-mail não registrado:", e instanceof Error ? e.message : e);
    // 5xx para o provedor tentar de novo; o e-mail já ficou guardado.
    return NextResponse.json({ error: "falha ao registrar" }, { status: 500 });
  }
}
