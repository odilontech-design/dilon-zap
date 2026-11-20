import { NextResponse } from "next/server";
import { ErroDeConta } from "@/lib/contas-receber";
import { ErroDePagar } from "@/lib/contas-pagar";
import { ErroDeVeiculo } from "@/lib/veiculos";
import { ErroFipe } from "@/lib/fipe";

/**
 * Transforma os erros esperados (regra de negócio, conta, FIPE) na resposta
 * com a mensagem da tela. Qualquer outro sobe e vira 500, como deve.
 */
export function respostaDeErro(e: unknown): NextResponse {
  if (e instanceof ErroDeVeiculo || e instanceof ErroDeConta || e instanceof ErroDePagar) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof ErroFipe) return NextResponse.json({ error: e.message }, { status: 502 });
  throw e;
}

export const SEM_PERMISSAO = () => NextResponse.json({ error: "só a gestão (dono ou financeiro) pode fazer isso" }, { status: 403 });
