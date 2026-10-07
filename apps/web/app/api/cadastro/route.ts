import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { documentoValido, somenteDigitos } from "@/lib/documento";

/**
 * Autocadastro vindo da página de login.
 *
 * Esta rota é PÚBLICA e grava no banco — a única assim no sistema. Ela existe
 * porque a Dilon Tech faz tráfego pago pra cá, e tráfego pago significa que
 * robô vai achar o formulário. Daí as três barreiras abaixo; nenhuma delas é
 * paranoia, são o custo de ter um endereço aberto na internet.
 *
 * O que ela NÃO faz, de propósito: criar empresa, usuário ou qualquer acesso.
 * Só registra o pedido. Quem cria a conta é a Dilon Tech, aprovando no painel.
 * Se esta rota criasse conta, bastaria um robô insistente pra encher o sistema
 * de empresas.
 */

const schema = z.object({
  nome: z.string().trim().min(2, "informe seu nome").max(120),
  empresa: z.string().trim().min(2, "informe o nome da empresa").max(120),
  email: z.string().trim().email("e-mail inválido").max(160),
  telefone: z.string().trim().min(8, "telefone inválido").max(40),
  documento: z.string().trim().min(11).max(30),
  /** Campo-armadilha: ver abaixo. Humano nunca preenche. */
  website: z.string().optional(),
});

/**
 * Quantos pedidos um mesmo endereço pode mandar por hora.
 *
 * Em memória de propósito: zera a cada deploy e não guarda IP em lugar nenhum.
 * Guardar IP num banco significaria assumir um dado pessoal e um prazo de
 * descarte pra proteger contra robô — caro demais pro que resolve. Quem passar
 * daqui ainda esbarra na armadilha e na checagem de documento.
 */
const TETO_POR_HORA = 5;
const JANELA_MS = 60 * 60 * 1000;
const tentativas = new Map<string, number[]>();

function passouDoTeto(chave: string): boolean {
  const agora = Date.now();
  const recentes = (tentativas.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  tentativas.set(chave, recentes);

  // Limpeza preguiçosa: sem isto o Map cresceria pra sempre num processo que
  // fica semanas no ar.
  if (tentativas.size > 5000) {
    for (const [k, v] of tentativas) {
      if (v.every((t) => agora - t >= JANELA_MS)) tentativas.delete(k);
    }
  }
  return recentes.length > TETO_POR_HORA;
}

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const parsed = schema.safeParse(corpo);

  // Mensagem genérica no formato: o formulário já valida campo a campo, e
  // detalhar aqui só ensina o robô o que ajustar.
  if (!parsed.success) {
    return NextResponse.json({ error: "confira os dados e tente de novo" }, { status: 400 });
  }
  const d = parsed.data;

  // 1. Armadilha. O campo "website" é invisível na tela e nenhum humano o
  // preenche; robô que preenche formulário inteiro cai aqui. Responde 200
  // fingindo sucesso — dizer "você é um robô" é dar o retorno que ele precisa
  // pra tentar de novo sem o campo.
  if (d.website && d.website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  // 2. Teto por endereço.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "desconhecido";
  if (passouDoTeto(ip)) {
    return NextResponse.json(
      { error: "muitos pedidos deste dispositivo. Tente de novo mais tarde." },
      { status: 429 }
    );
  }

  // 3. Documento de verdade, pelo dígito verificador. Barra "11111111111" e
  // qualquer sequência digitada ao acaso — ver lib/documento.
  const documento = somenteDigitos(d.documento);
  if (!documentoValido(documento)) {
    return NextResponse.json({ error: "CPF ou CNPJ inválido" }, { status: 400 });
  }

  const email = d.email.toLowerCase();

  // Já é cliente: não vira pedido novo. Mandar pro login é mais útil que um
  // "obrigado" que nunca vai ser aprovado.
  const jaTemConta = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (jaTemConta) {
    return NextResponse.json(
      { error: "este e-mail já tem acesso ao Dilon Zap. Use 'entrar' acima." },
      { status: 409 }
    );
  }

  // Pedido repetido não vira linha nova: a pessoa que clica duas vezes, ou
  // volta no dia seguinte achando que não enviou, não pode gerar uma fila de
  // cadastros iguais pra Dilon Tech peneirar. Responde como sucesso porque,
  // pra ela, é: o pedido está lá.
  const pendente = await prisma.solicitacaoDeAcesso.findFirst({
    where: { status: "PENDENTE", OR: [{ email }, { documento }] },
    select: { id: true },
  });
  if (pendente) return NextResponse.json({ ok: true, jaRegistrado: true });

  await prisma.solicitacaoDeAcesso.create({
    data: {
      nome: d.nome,
      empresa: d.empresa,
      email,
      telefone: d.telefone,
      documento,
    },
  });

  return NextResponse.json({ ok: true });
}
