import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { checkNumbersOnWhatsApp } from "@/lib/worker-client";

// Quantos números por chamada. O onWhatsApp aceita lote, mas pedir a base
// inteira de uma vez é o tipo de consulta que faz o WhatsApp desconfiar do
// número — e o custo de derrubar a sessão da Believe é bem maior que o de
// checar em várias rodadas.
const LOTE = 50;

/**
 * Checa quais contatos ainda não verificados têm conta no WhatsApp.
 *
 * Roda sob demanda (a atendente clica), e não em varredura automática: é
 * uma consulta ao servidor do WhatsApp, e fazer isso sozinho em background
 * pela base toda é comportamento que chama atenção sem ninguém precisar.
 */
export async function POST() {
  const user = await requireUser();
  if (user.role !== "OWNER") return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  // Só telefone: @lid é identificador interno e o WhatsApp não responde
  // sobre ele. Contato só-@lid fica sem checagem, que é diferente de "não
  // tem WhatsApp".
  const pendentes = await prisma.contact.findMany({
    where: {
      tenantId: user.tenantId,
      whatsappCheckedAt: null,
      waJid: { endsWith: "@s.whatsapp.net" },
    },
    select: { id: true, waJid: true },
    take: LOTE,
  });

  if (pendentes.length === 0) {
    return NextResponse.json({ verificados: 0, semWhatsapp: 0, restantes: 0 });
  }

  const r = await checkNumbersOnWhatsApp(
    user.tenantId,
    pendentes.map((c) => c.waJid)
  );
  if (!r.ok || !r.resultado) {
    return NextResponse.json({ error: r.reason ?? "não foi possível checar agora" }, { status: 502 });
  }

  const agora = new Date();
  let semWhatsapp = 0;

  // Um update por contato: são no máximo LOTE registros, e agrupar em dois
  // updateMany (tem/não tem) economizaria pouco em troca de um código que
  // erra fácil na hora de montar as duas listas.
  for (const c of pendentes) {
    const tem = r.resultado[c.waJid] === true;
    if (!tem) semWhatsapp++;
    await prisma.contact.update({
      where: { id: c.id },
      data: { hasWhatsapp: tem, whatsappCheckedAt: agora },
    });
  }

  const restantes = await prisma.contact.count({
    where: {
      tenantId: user.tenantId,
      whatsappCheckedAt: null,
      waJid: { endsWith: "@s.whatsapp.net" },
    },
  });

  return NextResponse.json({ verificados: pendentes.length, semWhatsapp, restantes });
}
