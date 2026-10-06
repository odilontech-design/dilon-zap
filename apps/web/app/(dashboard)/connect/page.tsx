import { requireUser } from "@/lib/session";
import { ConnectPanel } from "./connect-panel";

export default async function ConnectPage() {
  const user = await requireUser();

  // Só o responsável conecta uma linha ADICIONAL — é decisão de estrutura da
  // empresa, não de operação do dia. Religar a linha existente qualquer um que
  // chegue nesta tela continua podendo.
  const podeAdicionar = user.role === "OWNER" || user.role === "SUPERADMIN";

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">Conectar número</h1>
      <ConnectPanel podeAdicionar={podeAdicionar} />
    </div>
  );
}
