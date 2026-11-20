import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { FichaVeiculo } from "../ficha-veiculo";

export default async function VeiculoPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("VEICULOS")) redirect("/painel");
  return (
    <div className="p-4 md:p-8">
      <FichaVeiculo id={params.id} />
    </div>
  );
}
