import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ReceivablesPanel } from "./receivables-panel";

export default async function ReceberPage() {
  const user = await requireUser();

  // Atendente não tem o que fazer aqui: a lista é de gestão, e mostrar quanto
  // cada cliente deve pra quem só atende é informação sem uso e com peso.
  if (user.role !== "OWNER" && user.role !== "FINANCEIRO") redirect("/painel");

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">Contas a receber</h1>
      <ReceivablesPanel podeReceber />
    </div>
  );
}
