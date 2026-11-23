import { requireSuperAdmin } from "@/lib/session";
import { ListaDeImplantacoes } from "./lista";

export default async function ImplantacaoPage() {
  await requireSuperAdmin();
  return (
    <div className="p-4 md:p-8">
      <ListaDeImplantacoes />
    </div>
  );
}
