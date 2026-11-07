import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { AbasOtica } from "./abas-otica";
import { QuadroOS } from "./quadro-os";

export default async function OticaPage() {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("OTICA")) redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <AbasOtica atual="os" role={user.role} />
      <QuadroOS />
    </div>
  );
}
