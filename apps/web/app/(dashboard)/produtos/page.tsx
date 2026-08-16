import { requireUser } from "@/lib/session";
import { ProductsPanel } from "./products-panel";

/**
 * Duas permissões diferentes de propósito.
 *
 * Cadastrar e mudar PREÇO é do Responsável — preço é decisão da empresa, e
 * se cada um puder editar deixa de existir tabela.
 *
 * Mexer no ESTOQUE é do Responsável e do Financeiro, porque quem recebe a
 * carga do fornecedor e faz inventário é o financeiro. A consultora consulta
 * o saldo (vai precisar ao montar pedido) mas não lança entrada nem ajuste.
 */
export default async function ProdutosPage() {
  const user = await requireUser();
  return (
    <ProductsPanel
      podeEditar={user.role === "OWNER"}
      podeMexerEstoque={user.role === "OWNER" || user.role === "FINANCEIRO"}
    />
  );
}
