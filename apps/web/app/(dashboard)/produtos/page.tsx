import { requireUser } from "@/lib/session";
import { recursosDoTenant } from "@/lib/plano";
import { ProductsPanel } from "./products-panel";

/**
 * Responsável e Financeiro fazem tudo aqui: cadastram produto, mudam preço e
 * mexem no estoque. Quem negocia valor e quem recebe a carga do fornecedor é
 * o financeiro — prendê-lo fora disso criaria uma volta pelo Responsável a
 * cada preço alterado.
 *
 * A consultora só consulta: vai precisar do preço e do saldo ao montar
 * pedido, mas preço é decisão da empresa e estoque é responsabilidade de
 * quem conta a mercadoria.
 *
 * O catálogo serve a dois recursos. Com Pedidos, é produto com estoque pra
 * vender pelo chat. Com Materiais, é o lugar da biblioteca de cada serviço
 * (documento, vídeo). A Hemoderi tem só Materiais — pra ela a coluna de
 * estoque não existe, e mostrá-la levaria a um lançamento que a rota recusa.
 */
export default async function ProdutosPage() {
  const user = await requireUser();
  const gerencia = user.role === "OWNER" || user.role === "FINANCEIRO";
  const recursos = await recursosDoTenant(user.tenantId);
  return (
    <ProductsPanel
      podeEditar={gerencia}
      podeMexerEstoque={gerencia}
      temEstoque={user.role === "SUPERADMIN" || recursos.has("PEDIDOS")}
      temMateriais={user.role === "SUPERADMIN" || recursos.has("MATERIAIS")}
    />
  );
}
