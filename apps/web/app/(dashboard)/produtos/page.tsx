import { requireUser } from "@/lib/session";
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
 */
export default async function ProdutosPage() {
  const user = await requireUser();
  const gerencia = user.role === "OWNER" || user.role === "FINANCEIRO";
  return <ProductsPanel podeEditar={gerencia} podeMexerEstoque={gerencia} />;
}
