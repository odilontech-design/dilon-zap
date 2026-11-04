import { redirect } from "next/navigation";
import { verificarAcessoSdr } from "@/lib/sdr/acesso";
import { SdrPanel } from "./sdr-panel";

export default async function SdrPage() {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <SdrPanel podeEscrever={acesso.podeEscrever} />
    </div>
  );
}
