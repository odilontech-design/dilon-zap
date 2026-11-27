import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { AbasVeiculos } from "../comum";
import { PainelPortais } from "./painel-portais";

export default async function PortaisPage() {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("VEICULOS")) redirect("/painel");
  if (!ehGerencia(user.role)) redirect("/veiculos");
  return (
    <div className="p-4 md:p-8">
      <AbasVeiculos atual="portais" gerencia />
      <Suspense>
        <PainelPortais />
      </Suspense>
    </div>
  );
}
