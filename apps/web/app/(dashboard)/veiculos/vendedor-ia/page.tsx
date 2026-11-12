import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { AbasVeiculos } from "../comum";
import { ConfigVendedorIa } from "./config-vendedor-ia";

export default async function VendedorIaPage() {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("VENDEDOR_IA")) redirect("/veiculos");
  if (!ehGerencia(user.role)) redirect("/veiculos");
  return (
    <div className="p-4 md:p-8">
      <AbasVeiculos atual="vendedor-ia" gerencia />
      <ConfigVendedorIa />
    </div>
  );
}
