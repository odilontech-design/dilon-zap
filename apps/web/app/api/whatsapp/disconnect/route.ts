import { NextResponse } from "next/server";
import { disconnectWhatsApp } from "@/lib/worker-client";
import { requireUser } from "@/lib/session";

export async function POST() {
  const user = await requireUser();

  const result = await disconnectWhatsApp(user.tenantId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "não deu pra desconectar" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
