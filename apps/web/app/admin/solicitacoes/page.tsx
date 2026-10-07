import { requireSuperAdmin } from "@/lib/session";
import { SolicitacoesPanel } from "./solicitacoes-panel";

export default async function SolicitacoesPage() {
  await requireSuperAdmin();

  return (
    <div className="p-4 md:p-8">
      <h1 className="mb-1 text-lg font-semibold text-neutral-100">Cadastros</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Quem se cadastrou pela página de login. Aprovar cria a empresa, o acesso do responsável e a
        assinatura em teste.
      </p>
      <SolicitacoesPanel />
    </div>
  );
}
