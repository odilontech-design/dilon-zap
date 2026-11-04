import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { dadosInvalidos, lerJson, recusa, respostaDeErro, verificarAcessoSdr, type AcessoSdr } from "./acesso";
import type { NivelSdr } from "./regras";

export type AcessoLiberado = Extract<AcessoSdr, { ok: true }>;

/**
 * O miolo igual de todas as rotas comerciais do SDR: portão de acesso, leitura do corpo, validação
 * (ZodError vira 400) e erros do SDR com a mensagem e o status certos. O tenant vem sempre da sessão.
 */
export async function rotaSdr(req: Request | null, nivel: NivelSdr, fn: (acesso: AcessoLiberado, corpo: unknown) => Promise<unknown>, status = 200) {
  const acesso = await verificarAcessoSdr(nivel);
  if (!acesso.ok) return recusa(acesso);
  let corpo: unknown;
  if (req) {
    const lido = await lerJson(req, 512 * 1024);
    if (!lido.ok) return lido.resposta;
    corpo = lido.dados;
  }
  try {
    return NextResponse.json(await fn(acesso, corpo), { status });
  } catch (e) {
    if (e instanceof ZodError) return dadosInvalidos();
    return respostaDeErro(e);
  }
}
