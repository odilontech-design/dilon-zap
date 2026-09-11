import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { telefoneConhecido } from "@/lib/contact";
import { montarRecibo } from "@/lib/recibo";
import { ReciboTermico } from "@/components/recibo-termico";
import { ReciboAcoes } from "./recibo-acoes";

/**
 * Recibo do pedido, aberto numa aba própria pra imprimir.
 *
 * Fora do (dashboard) de propósito: menu lateral e cabeçalho do sistema não
 * podem ir pro papel, e esconder tudo com CSS de impressão seria frágil —
 * qualquer tela nova do dashboard esquecida no @media print sairia na bobina.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Recibo · Dilon Zap" };

// A página inteira força papel branco e texto preto, por cima do tema do
// sistema: quem usa modo escuro não pode mandar fundo escuro pra impressora.
const ESTILO_PAGINA = `
html, body { background: #e7e5e0 !important; color: #000 !important; }
.recibo { margin-top: 16px !important; margin-bottom: 32px !important; box-shadow: 0 1px 3px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.08); }
.barra-recibo { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 12px; padding: 10px 16px; background: #fff; border-bottom: 1px solid #d6d3cc; font: 13px/1.4 system-ui, sans-serif; color: #3f3f46; }
.barra-recibo button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid #c8c5bd; background: #fff; color: #18181b; cursor: pointer; }
.barra-recibo button.primario { background: #0f766e; border-color: #0f766e; color: #fff; font-weight: 600; }
.barra-recibo button:disabled { opacity: .5; cursor: default; }
.barra-recibo button:focus-visible { outline: 2px solid #0f766e; outline-offset: 2px; }
.aviso-recibo { max-width: 420px; margin: 64px auto; padding: 24px; background: #fff; border-radius: 8px; font: 14px/1.5 system-ui, sans-serif; color: #3f3f46; text-align: center; }
@page { margin: 0; }
@media print {
  html, body { background: #fff !important; margin: 0 !important; }
  .so-tela { display: none !important; }
  .recibo { margin: 0 auto !important; box-shadow: none !important; }
}
`;

function Aviso({ texto }: { texto: string }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILO_PAGINA }} />
      <p className="aviso-recibo">{texto}</p>
    </>
  );
}

export default async function ReciboPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { imprimir?: string };
}) {
  const user = await requireUser();
  if (await exigirRecurso(user, "PEDIDOS")) {
    return <Aviso texto="Pedidos não fazem parte do plano desta empresa." />;
  }

  const [tenant, pedido] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: {
        name: true,
        timezone: true,
        reciboNome: true,
        reciboDocumento: true,
        reciboEndereco: true,
        reciboTelefone: true,
        reciboRodape: true,
        reciboLarguraMm: true,
      },
    }),
    prisma.order.findFirst({
      where: { id: params.id, tenantId: user.tenantId },
      select: {
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
        createdBy: { select: { name: true } },
        items: {
          select: { nomeProduto: true, precoTabelaCents: true, precoUnitCents: true, quantidade: true },
          orderBy: { id: "asc" },
        },
        pagamentos: { select: { valorCents: true } },
        contact: { select: { name: true, waJid: true, phoneNumber: true, documento: true, endereco: true } },
      },
    }),
  ]);

  if (!pedido) return <Aviso texto="Pedido não encontrado." />;

  // Recibo de pedido aberto seria papel com valor que ainda pode mudar — e o
  // cliente sairia da loja com um total que não é o que foi fechado.
  if (pedido.status !== "FECHADO") {
    return <Aviso texto={`O pedido #${pedido.numero} ainda não foi fechado. O recibo sai depois do fechamento, com o valor final.`} />;
  }

  const recibo = montarRecibo({
    empresa: { ...tenant, nome: tenant.name },
    pedido: {
      ...pedido,
      vendedor: pedido.createdBy?.name ?? null,
      itens: pedido.items,
    },
    cliente: {
      nome: pedido.contact.name,
      telefone: telefoneConhecido(pedido.contact),
      documento: pedido.contact.documento,
      endereco: pedido.contact.endereco,
    },
  });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILO_PAGINA }} />
      <ReciboAcoes larguraMm={recibo.larguraMm} imprimirAoAbrir={searchParams.imprimir !== "0"} />
      <ReciboTermico recibo={recibo} />
    </>
  );
}
