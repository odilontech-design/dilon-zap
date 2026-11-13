import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { AbasVeiculos } from "../comum";
import { CaixaInstagram } from "./caixa-instagram";

export default async function InstagramPage() {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("VEICULOS")) redirect("/painel");
  return (
    <div className="p-4 md:p-8">
      <AbasVeiculos atual="instagram" gerencia={ehGerencia(user.role)} />
      <Suspense>
        <CaixaInstagram />
      </Suspense>
    </div>
  );
}
