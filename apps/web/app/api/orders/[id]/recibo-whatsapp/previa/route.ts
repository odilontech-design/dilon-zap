import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import {
  carregarPedidoDoRecibo,
  desenharReciboPng,
  montarReciboDoPedido,
  resolverDadosDoCliente,
} from "@/lib/recibo-render";

/**
 * O recibo exatamente como o cliente vai receber, pra conferir antes de
 * mandar. Não salva nada: nem o documento na ficha, nem arquivo no R2, nem
 * mensagem na fila — é só o desenho.
 *
 * Usa o mesmo desenharReciboPng() do envio de propósito. Prévia desenhada por
 * outro caminho é prévia que mente.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const carregado = await carregarPedidoDoRecibo(user.tenantId, params.id);
  if (!carregado) {
    return NextResponse.json(
      { error: "Pedido não encontrado ou ainda não fechado." },
      { status: 404 }
    );
  }

  // Os campos chegam pela query porque a tela ainda está com eles em
  // digitação — a prévia mostra o que a pessoa vê agora, não o que está salvo.
  const busca = new URL(req.url).searchParams;
  const cliente = resolverDadosDoCliente(carregado.pedido.contact, {
    documento: busca.has("documento") ? busca.get("documento") : undefined,
    nomeNoRecibo: busca.has("nomeNoRecibo") ? busca.get("nomeNoRecibo") : undefined,
  });

  const recibo = montarReciboDoPedido(carregado.empresa, carregado.pedido, cliente);
  const png = await desenharReciboPng(recibo, carregado.empresa.reciboLogoKey);

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Nunca guardar: o pedido pode ser alterado e a prévia tem que
      // acompanhar. Cache aqui faria a pessoa aprovar um recibo vencido.
      "Cache-Control": "no-store",
    },
  });
}
