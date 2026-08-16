import { requireUser } from "@/lib/session";
import { ProductsPanel } from "./products-panel";

// Atendente consulta o catálogo (vai precisar pra montar pedido); só o
// Responsável cadastra e muda preço. Preço é decisão da empresa — se cada
// atendente puder editar, deixa de existir tabela.
export default async function ProdutosPage() {
  const user = await requireUser();
  return <ProductsPanel podeEditar={user.role === "OWNER"} />;
}
