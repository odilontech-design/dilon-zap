import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { naoLidasDoChat } from "@/lib/team-chat-leitura";

/** GET /api/team-chat/nao-lidas — mensagens novas do Chat da equipe, no total e por canal. */
export async function GET() {
  const user = await requireUser();
  return NextResponse.json(await naoLidasDoChat(user));
}
