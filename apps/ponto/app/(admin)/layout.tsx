import Link from "@/components/link";
import { prisma } from "@dilon-zap/ponto-db";
import { MenuAdmin } from "@/components/menu";
import { PLANOS } from "@/lib/planos";
import { requireAdmin } from "@/lib/session";
import { situacaoDaEmpresa } from "@/lib/cobranca";
import { AvisoAssinatura } from "@/components/aviso-assinatura";

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const u = await requireAdmin();
  const [situacao, identificada] = await Promise.all([
    situacaoDaEmpresa(u.empresaId),
    prisma.registroRep.findFirst({ where: { empresaId: u.empresaId, tipo: 2 }, select: { id: true } }),
  ]);
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <MenuAdmin
        nome={u.nome}
        empresa={u.empresa.nomeFantasia || u.empresa.razaoSocial}
        plano={PLANOS[u.empresa.plano].nome}
        temColaborador={Boolean(u.colaboradorId)}
        mostrarAssinatura={situacao.estado !== "ISENTA"}
      />
      <main className="flex-1 min-w-0 p-5 md:p-8">
        <AvisoAssinatura situacao={situacao} />
        {!identificada && (
          <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-neutral-800 nao-imprimir">
            Falta a identificação da empresa no registro de ponto (seu CPF e o endereço do estabelecimento).{" "}
            <Link href="/configuracoes" className="font-medium underline">
              Preencher agora
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
