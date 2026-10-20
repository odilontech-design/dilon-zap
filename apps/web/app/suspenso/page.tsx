import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@dilon-zap/db";
import { authOptions } from "@/lib/auth";
import { linkComMensagem, numeroDoComercial } from "@/lib/suporte";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acesso suspenso · Dilon Zap" };

/**
 * Para onde requireUser manda quem é de uma empresa suspensa. Fora do
 * (dashboard) e sem requireUser, de propósito: ele mesmo redireciona pra cá,
 * e passar por ele daqui seria um laço sem fim.
 */
export default async function SuspensoPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { name?: string; tenantId?: string } | undefined;
  if (!user?.tenantId) redirect("/login");

  const empresa = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true, suspensoEm: true } });
  // Reativada enquanto a tela estava aberta: volta pro painel.
  if (!empresa?.suspensoEm) redirect("/painel");

  const numero = numeroDoComercial();
  const link = numero
    ? linkComMensagem(numero, `Olá! Sou da ${empresa.name} e o acesso ao Dilon Zap está suspenso. Gostaria de regularizar.`)
    : null;

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Acesso suspenso</h1>
        <p className="mt-2 text-sm text-neutral-600">
          O acesso da {empresa.name} ao Dilon Zap está suspenso por pendência financeira.
        </p>
        <p className="mt-3 text-sm text-neutral-600">
          O responsável pela conta precisa falar com o suporte da Dilon Tech para regularizar. Assim que o pagamento for
          confirmado, o acesso volta na hora, com todas as conversas, contatos e pedidos como estavam.
        </p>
        <p className="mt-3 text-sm text-neutral-500">
          Seus dados estão preservados e o WhatsApp continua conectado, recebendo as mensagens dos clientes.
        </p>
        <div className="mt-5 flex items-center gap-4 text-sm">
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90">
              Falar com o suporte
            </a>
          )}
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
