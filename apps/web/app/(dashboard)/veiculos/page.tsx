import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { AbasVeiculos } from "./comum";
import { Estoque } from "./estoque";

export default async function VeiculosPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("VEICULOS")) redirect("/painel");
  const vendidos = searchParams.status === "VENDIDO";
  return (
    <div className="p-4 md:p-8">
      <AbasVeiculos atual={vendidos ? "vendidos" : "estoque"} />
      <Estoque vendidos={vendidos} />
    </div>
  );
}
