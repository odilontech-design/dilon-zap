import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import type { PapelUsuario } from "@dilon-zap/erp-db";
import { authOptions } from "@/lib/auth";
import { temRecurso, type Recurso } from "@/lib/planos";
import type { UsuarioAtual } from "@/lib/session";

/**
 * Helpers das rotas de API.
 *
 * `requireUsuario()` do lib/session redireciona — comportamento certo numa
 * página, errado numa API (o fetch receberia um HTML de login com status 200
 * e o SWR trataria como sucesso). Aqui as falhas viram 401/403 de verdade.
 */

export class RespostaDeErro extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem);
  }
}

export async function usuarioDaApi(): Promise<UsuarioAtual> {
  const session = await getServerSession(authOptions);
  const usuario = session?.user as UsuarioAtual | undefined;
  if (!usuario) throw new RespostaDeErro(401, "não autenticado");
  return usuario;
}

export function exigirPapel(usuario: UsuarioAtual, papeis: PapelUsuario[]): void {
  if (!papeis.includes(usuario.papel)) throw new RespostaDeErro(403, "sem permissão para esta ação");
}

export function exigirRecurso(usuario: UsuarioAtual, recurso: Recurso): void {
  if (!temRecurso(usuario.plano, recurso)) {
    throw new RespostaDeErro(402, `recurso disponível em outro plano: ${recurso}`);
  }
}

export async function corpo<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    throw new RespostaDeErro(400, "corpo inválido");
  }

  const parsed = schema.safeParse(bruto);
  if (!parsed.success) {
    const primeiro = parsed.error.errors[0];
    throw new RespostaDeErro(400, primeiro ? `${primeiro.path.join(".")}: ${primeiro.message}` : "dados inválidos");
  }
  return parsed.data;
}

/**
 * Envolve o handler traduzindo exceção em resposta.
 *
 * Sem isso, cada rota repetiria o mesmo try/catch — e a que esquecesse
 * devolveria stack trace do Prisma pro navegador, com nome de tabela e
 * coluna. Erro inesperado vira 500 genérico e vai pro log do servidor.
 */
export function rota<Ctx>(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof RespostaDeErro) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
        return NextResponse.json({ error: "já existe um registro com esse valor" }, { status: 409 });
      }
      if (typeof err === "object" && err && (err as { code?: string }).code === "P2003") {
        return NextResponse.json({ error: "registro em uso por outro cadastro" }, { status: 409 });
      }
      console.error("[api]", err);
      return NextResponse.json({ error: "erro interno" }, { status: 500 });
    }
  };
}

export const ok = <T>(dados: T, status = 200) => NextResponse.json(dados, { status });
