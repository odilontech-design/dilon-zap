import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { EscanearOS } from "./escanear-os";

export default async function EscanearOSPage() {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("OTICA")) redirect("/painel");
  return (
    <div className="p-4 md:p-8">
      <EscanearOS />
    </div>
  );
}
