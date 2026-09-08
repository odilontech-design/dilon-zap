import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

/**
 * Menu de triagem (URA) do primeiro contato.
 *
 * O menu inteiro vai e volta de uma vez, igual ao horário de atendimento e
 * pelo mesmo motivo: ele é editado como um bloco ("1 Fiscal, 2 Contábil,
 * 3 DP"), e salvar opção a opção deixaria o menu meio-montado no ar entre uma
 * requisição e outra — com o worker já lendo e oferecendo ao cliente uma
 * lista que a empresa ainda estava escrevendo.
 */

const bodySchema = z.object({
  ativa: z.boolean(),
  mensagem: z.string().max(4096).nullable(),
  opcoes: z
    .array(
      z.object({
        rotulo: z.string().min(1, "dê um nome à opção").max(60),
        atendenteId: z.string().min(1, "escolha quem recebe"),
      })
    )
    // 9 porque o cliente responde com UM dígito. Passando disso, "10" começa
    // a competir com "1" na leitura da resposta e o menu fica ambíguo.
    .max(9, "no máximo 9 opções"),
});

export async function GET() {
  const user = await requireUser();

  const [tenant, opcoes] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { uraAtiva: true, uraMensagem: true },
    }),
    prisma.uraOpcao.findMany({
      where: { tenantId: user.tenantId },
      select: {
        ordem: true,
        rotulo: true,
        atendenteId: true,
        // O nome vem junto pra tela não precisar cruzar com /api/users só
        // pra mostrar quem recebe, e pra ficar visível quando o destino foi
        // desativado (aí o seletor mostra a pessoa, mas o worker já ignora).
        atendente: { select: { name: true, deactivatedAt: true } },
      },
      orderBy: { ordem: "asc" },
    }),
  ]);

  return NextResponse.json({
    ativa: tenant.uraAtiva,
    mensagem: tenant.uraMensagem,
    opcoes: opcoes.map((o) => ({
      ordem: o.ordem,
      rotulo: o.rotulo,
      atendenteId: o.atendenteId,
      atendenteNome: o.atendente.name,
      atendenteAtivo: o.atendente.deactivatedAt === null,
    })),
  });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  if (user.role === "AGENT") {
    return NextResponse.json(
      { error: "só o responsável pela conta pode mudar o menu de triagem" },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { ativa, opcoes } = parsed.data;
  const mensagem = parsed.data.mensagem?.trim() || null;

  // Ligar o menu sem opção nenhuma não faria nada visível (o worker trata
  // como desligado) e a empresa ficaria esperando um menu que nunca sai.
  if (ativa && opcoes.length === 0) {
    return NextResponse.json(
      { error: "cadastre pelo menos uma opção antes de ligar o menu" },
      { status: 400 }
    );
  }

  // Destino tem que ser gente desta empresa e ativa. Sem esta checagem, um id
  // de outro tenant vindo na requisição encaminharia conversas pra fora da
  // empresa — e o banco aceitaria, porque UraOpcao referencia User direto.
  const destinos = [...new Set(opcoes.map((o) => o.atendenteId))];
  if (destinos.length > 0) {
    const validos = await prisma.user.count({
      where: { id: { in: destinos }, tenantId: user.tenantId, deactivatedAt: null },
    });
    if (validos !== destinos.length) {
      return NextResponse.json(
        { error: "uma das opções aponta para alguém que não está ativo na sua equipe" },
        { status: 400 }
      );
    }
  }

  // Troca o menu inteiro: apagar e recriar mantém a ordem exatamente como a
  // tela mostrou (ordem = posição na lista) sem ter que reconciliar quem saiu,
  // quem entrou e quem só mudou de lugar.
  await prisma.$transaction([
    prisma.uraOpcao.deleteMany({ where: { tenantId: user.tenantId } }),
    prisma.uraOpcao.createMany({
      data: opcoes.map((o, i) => ({
        tenantId: user.tenantId,
        ordem: i + 1,
        rotulo: o.rotulo.trim(),
        atendenteId: o.atendenteId,
      })),
    }),
    prisma.tenant.update({
      where: { id: user.tenantId },
      data: { uraAtiva: ativa, uraMensagem: mensagem },
    }),
  ]);

  await logAudit({
    actor: user,
    action: "ura.update",
    metadata: { ativa, opcoes: opcoes.length, temMensagem: Boolean(mensagem) },
  });

  return NextResponse.json({ ok: true });
}
