import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
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

// Destino como tipo + id, e não como dois campos opcionais.
//
// No banco são duas colunas nuláveis das quais exatamente uma pode estar
// preenchida — restrição que o Postgres garantiria com um CHECK, mas o
// projeto sincroniza schema com `db push`, que descartaria o CHECK na
// próxima sincronização em silêncio. Modelando assim no payload, "os dois
// preenchidos" e "nenhum preenchido" deixam de ser representáveis: o zod
// recusa antes de chegar aqui, e não existe caminho de gravação que escape.
const destinoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("SETOR"), id: z.string().min(1) }),
  z.object({ tipo: z.literal("ATENDENTE"), id: z.string().min(1) }),
]);

const bodySchema = z.object({
  ativa: z.boolean(),
  mensagem: z.string().max(4096).nullable(),
  opcoes: z
    .array(
      z.object({
        rotulo: z.string().min(1, "dê um nome à opção").max(60),
        destino: destinoSchema,
      })
    )
    // 9 porque o cliente responde com UM dígito. Passando disso, "10" começa
    // a competir com "1" na leitura da resposta e o menu fica ambíguo.
    .max(9, "no máximo 9 opções"),
});

export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "URA");
  if (bloqueio) return bloqueio;

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
        setorId: true,
        // Nome e situação vêm juntos pra tela não precisar cruzar com outras
        // rotas só pra mostrar o destino, e pra continuar legível quando o
        // destino foi desativado (o seletor mostra, o worker já ignora).
        atendente: { select: { name: true, deactivatedAt: true } },
        setor: {
          select: {
            nome: true,
            cor: true,
            ativo: true,
            _count: { select: { membros: true } },
          },
        },
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
      destino: o.setorId
        ? {
            tipo: "SETOR" as const,
            id: o.setorId,
            nome: o.setor?.nome ?? "(setor removido)",
            cor: o.setor?.cor ?? null,
            ativo: Boolean(o.setor?.ativo) && (o.setor?._count.membros ?? 0) > 0,
          }
        : o.atendenteId
          ? {
              tipo: "ATENDENTE" as const,
              id: o.atendenteId,
              nome: o.atendente?.name ?? "(usuário removido)",
              cor: null,
              ativo: o.atendente?.deactivatedAt === null,
            }
          : null,
    })),
  });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "URA");
  if (bloqueio) return bloqueio;
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

  // Destino tem que ser desta empresa e estar em pé. Sem esta checagem, um id
  // de outro tenant vindo na requisição encaminharia conversas pra fora da
  // empresa — e o banco aceitaria, porque UraOpcao referencia User e Setor
  // direto, sem saber de qual tenant a opção é.
  const idsAtendente = [...new Set(opcoes.filter((o) => o.destino.tipo === "ATENDENTE").map((o) => o.destino.id))];
  const idsSetor = [...new Set(opcoes.filter((o) => o.destino.tipo === "SETOR").map((o) => o.destino.id))];

  if (idsAtendente.length > 0) {
    const validos = await prisma.user.count({
      where: { id: { in: idsAtendente }, tenantId: user.tenantId, deactivatedAt: null },
    });
    if (validos !== idsAtendente.length) {
      return NextResponse.json(
        { error: "uma das opções aponta para alguém que não está ativo na sua equipe" },
        { status: 400 }
      );
    }
  }

  if (idsSetor.length > 0) {
    // Setor sem nenhum membro ativo é recusado AQUI, na hora de salvar, e não
    // ignorado depois. O worker já descarta a opção nesse caso, mas em
    // silêncio: a empresa veria o menu no ar sem a opção e não teria como
    // saber por quê. Falhar na configuração é o único momento em que a
    // pessoa está olhando.
    const setores = await prisma.setor.findMany({
      where: { id: { in: idsSetor }, tenantId: user.tenantId, ativo: true },
      select: { id: true, nome: true, _count: { select: { membros: true } } },
    });
    if (setores.length !== idsSetor.length) {
      return NextResponse.json(
        { error: "uma das opções aponta para um setor que não existe ou está desativado" },
        { status: 400 }
      );
    }
    const vazio = setores.find((s) => s._count.membros === 0);
    if (vazio) {
      return NextResponse.json(
        {
          error: `o setor "${vazio.nome}" não tem ninguém dentro. Adicione ao menos uma pessoa antes de encaminhar para ele.`,
        },
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
        setorId: o.destino.tipo === "SETOR" ? o.destino.id : null,
        atendenteId: o.destino.tipo === "ATENDENTE" ? o.destino.id : null,
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
    metadata: {
      ativa,
      opcoes: opcoes.length,
      setores: idsSetor.length,
      atendentes: idsAtendente.length,
      temMensagem: Boolean(mensagem),
    },
  });

  return NextResponse.json({ ok: true });
}
