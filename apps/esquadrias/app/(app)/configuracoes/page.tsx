import { prisma } from "@dilon-zap/erp-db";
import { requireDono } from "@/lib/session";
import { FormularioConfiguracoes } from "./formulario-configuracoes";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const usuario = await requireDono();
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: usuario.empresaId } });

  return <FormularioConfiguracoes empresa={JSON.parse(JSON.stringify(empresa))} />;
}
