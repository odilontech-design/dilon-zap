import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { downloadMedia } from "@dilon-zap/storage";
import { prisma } from "@dilon-zap/db";
import { telefoneConhecido } from "@/lib/contact";
import { calcularTotais } from "@/lib/orders";
import { montarRecibo, parcelasDoRecibo, type Recibo } from "@/lib/recibo";
import { ReciboImagemJSX } from "@/lib/recibo-imagem";

/**
 * Monta e desenha o recibo que vai pro cliente — compartilhado entre a prévia
 * e o envio de verdade.
 *
 * Os dois caminhos PRECISAM passar por aqui. Prévia que desenha por um código
 * e envio que desenha por outro é prévia que mente: a pessoa aprova uma coisa
 * e o cliente recebe outra, e ninguém descobre até o cliente reclamar.
 */

const LARGURA_PX = 600;

/**
 * O que a tela de confirmação do envio deixa ajustar na hora.
 *
 * Tudo isto é dado que só aparece no recibo, e o recibo nasce DEPOIS do
 * fechamento — preencher só na hora de fechar deixava o pedido já fechado sem
 * como corrigir (foi o que aconteceu com o mês de referência).
 * Campo ausente mantém o salvo; texto vazio limpa.
 */
export type AjustesDoRecibo = {
  documento?: string | null;
  nomeNoRecibo?: string | null;
  mesReferencia?: string | null;
};

const SELECAO_TENANT = {
  name: true,
  timezone: true,
  reciboNome: true,
  reciboDocumento: true,
  reciboEndereco: true,
  reciboTelefone: true,
  reciboRodape: true,
  reciboChavePix: true,
  reciboLogoKey: true,
  reciboCorDestaque: true,
  reciboTextoPendente: true,
  reciboTextoPago: true,
  reciboOcultarTelefone: true,
  reciboMostrarDesconto: true,
  reciboLarguraMm: true,
} as const;

const SELECAO_PEDIDO = {
  id: true,
  numero: true,
  status: true,
  createdAt: true,
  fechadoEm: true,
  paymentMethod: true,
  pago: true,
  pagoEm: true,
  vencimento: true,
  subtotalCents: true,
  descontoCents: true,
  totalCents: true,
  observacao: true,
  mesReferencia: true,
  createdBy: { select: { name: true } },
  items: {
    select: { nomeProduto: true, precoTabelaCents: true, precoUnitCents: true, quantidade: true },
    orderBy: { id: "asc" },
  },
  pagamentos: { select: { valorCents: true } },
  planoEntradaCents: true,
  planoNumParcelas: true,
  planoPeriodicidade: true,
  planoPrimeiroVencimento: true,
  conta: {
    select: {
      canceladaEm: true,
      parcelas: {
        where: { canceladaEm: null, reembolsadaEm: null },
        orderBy: { vencimento: "asc" },
        select: { tipo: true, numero: true, totalParcelas: true, vencimento: true, valorCents: true, pagamentos: { select: { valorCents: true } } },
      },
    },
  },
  contact: {
    select: {
      id: true,
      name: true,
      waJid: true,
      phoneNumber: true,
      documento: true,
      nomeNoRecibo: true,
      endereco: true,
    },
  },
  conversationId: true,
} as const;

type Carregado = NonNullable<Awaited<ReturnType<typeof carregarPedidoDoRecibo>>>;
export type PedidoDoRecibo = Carregado["pedido"];
export type EmpresaDoRecibo = Carregado["empresa"];

/**
 * Carrega empresa e pedido. Devolve null quando o pedido não existe ou ainda
 * não foi fechado — recibo de pedido aberto seria um valor que ainda pode
 * mudar na mão do cliente.
 */
export async function carregarPedidoDoRecibo(tenantId: string, orderId: string, opcoes: { orcamento?: boolean } = {}) {
  const [empresa, pedido] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: SELECAO_TENANT }),
    prisma.order.findFirst({ where: { id: orderId, tenantId }, select: SELECAO_PEDIDO }),
  ]);
  if (!pedido) return null;
  // Recibo só de pedido fechado; orçamento só de pedido ainda em montagem.
  if (opcoes.orcamento ? pedido.status !== "RASCUNHO" && pedido.status !== "AGUARDANDO_FINANCEIRO" : pedido.status !== "FECHADO") return null;
  if (opcoes.orcamento) {
    // Antes do fechamento os totais gravados ainda não valem: conta pelos itens.
    const totais = calcularTotais(pedido.items, pedido.descontoCents);
    return { empresa, pedido: { ...pedido, ...totais } };
  }
  return { empresa, pedido };
}

/**
 * Aplica o que a pessoa digitou na tela de confirmação por cima do que está na
 * ficha. Campo ausente mantém o salvo; texto vazio limpa.
 */
const resolver = (novo: string | null | undefined, salvo: string | null) =>
  novo === undefined ? salvo : novo?.trim() || null;

export function resolverDadosDoCliente(
  contato: { documento: string | null; nomeNoRecibo: string | null },
  ajustes: AjustesDoRecibo
) {
  return {
    documento: resolver(ajustes.documento, contato.documento),
    nomeNoRecibo: resolver(ajustes.nomeNoRecibo, contato.nomeNoRecibo),
  };
}

/** Mês de referência fica no PEDIDO, não no contato — muda a cada cobrança. */
export function resolverMesReferencia(
  pedido: { mesReferencia: string | null },
  ajustes: AjustesDoRecibo
) {
  return resolver(ajustes.mesReferencia, pedido.mesReferencia);
}

export function montarReciboDoPedido(
  empresa: EmpresaDoRecibo,
  pedido: PedidoDoRecibo,
  cliente: { documento: string | null; nomeNoRecibo: string | null },
  opcoes: { orcamento?: boolean } = {}
): Recibo {
  return montarRecibo({
    ...(opcoes.orcamento
      ? {
          orcamento: {
            plano: {
              entradaCents: pedido.planoEntradaCents,
              numParcelas: pedido.planoNumParcelas,
              periodicidade: pedido.planoPeriodicidade,
              primeiroVencimento: pedido.planoPrimeiroVencimento,
            },
          },
        }
      : {}),
    empresa: { ...empresa, nome: empresa.name },
    pedido: { ...pedido, vendedor: pedido.createdBy?.name ?? null, itens: pedido.items, parcelas: parcelasDoRecibo(pedido.conta) },
    cliente: {
      nome: pedido.contact.name,
      nomeNoRecibo: cliente.nomeNoRecibo,
      telefone: telefoneConhecido(pedido.contact),
      documento: cliente.documento,
      endereco: pedido.contact.endereco,
    },
  });
}

/**
 * Desenha o recibo em PNG.
 *
 * A altura NÃO é estimada. Antes era — uma conta por número de itens e linhas
 * — e bastava um rodapé mais longo pra ele sair cortado no meio da frase, que
 * foi o que a Guttierres viu. Passando `height: undefined`, o satori mede o
 * conteúdo e devolve a altura exata (ver setHeightAuto no satori).
 */
export async function desenharReciboPng(recibo: Recibo, logoKey?: string | null): Promise<Buffer> {
  const qrPix = recibo.pixCopiaECola
    ? await QRCode.toDataURL(recibo.pixCopiaECola, { margin: 1, width: 360 })
    : null;

  // O satori não busca URL — a imagem precisa chegar embutida. Logo quebrada
  // (chave apagada do bucket, credencial trocada) não pode derrubar o recibo
  // inteiro: sem ela o comprovante sai igual, só sem o desenho no topo.
  let logo: string | null = null;
  if (logoKey) {
    try {
      const bytes = await downloadMedia(logoKey);
      const tipo = logoKey.endsWith(".png") ? "png" : logoKey.endsWith(".webp") ? "webp" : "jpeg";
      logo = `data:image/${tipo};base64,${bytes.toString("base64")}`;
    } catch {
      logo = null;
    }
  }

  const imagem = new ImageResponse(ReciboImagemJSX({ recibo, qrPix, logo }), {
    width: LARGURA_PX,
    height: undefined as unknown as number,
  });

  return Buffer.from(await imagem.arrayBuffer());
}
