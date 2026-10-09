import { requireUser } from "@/lib/session";
import { recursosDoTenant } from "@/lib/plano";
import { ConnectPanel } from "./connect-panel";

export default async function ConnectPage() {
  const user = await requireUser();

  // Duas condições: a empresa precisa ter o recurso liberado pela Dilon Tech, e
  // dentro dela é decisão do responsável — não de operação do dia. Religar a
  // linha existente qualquer um que chegue nesta tela continua podendo.
  //
  // Esconder aqui é só pra ninguém esbarrar numa recusa; quem barra de verdade
  // é a rota (ver /api/whatsapp/connect).
  const recursos = await recursosDoTenant(user.tenantId);
  const podeAdicionar =
    (user.role === "OWNER" || user.role === "SUPERADMIN") &&
    (recursos.has("MULTI_NUMERO") || user.role === "SUPERADMIN");

  // Ligar e desligar as respostas automáticas de um número é do responsável.
  // Separado de podeAdicionar: o recurso de mais de um número é liberado por
  // empresa, mas o número pessoal de uma empresa de um número só também
  // precisa do interruptor.
  const podeAjustar = user.role === "OWNER" || user.role === "SUPERADMIN";

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">Conectar número</h1>
      <ConnectPanel podeAdicionar={podeAdicionar} podeAjustar={podeAjustar} />
    </div>
  );
}
