import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { TrocarSenhaForm } from "./trocar-senha-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trocar senha · Dilon Zap" };

// Fora do (dashboard) de propósito: é pra onde o painel manda quem ainda está
// com senha provisória, e dentro dele o próprio layout redirecionaria de novo
// pra cá, num laço sem fim.
export default async function TrocarSenhaPage() {
  const user = await requireUser();
  const conta = await prisma.user.findUnique({ where: { id: user.id }, select: { senhaProvisoria: true } });
  const obrigatoria = Boolean(conta?.senhaProvisoria);

  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{obrigatoria ? "Crie sua senha" : "Trocar senha"}</h1>
        <p className="mt-1 mb-5 text-sm text-neutral-500">
          {obrigatoria
            ? `Olá, ${user.name.split(" ")[0]}. Sua conta foi criada com uma senha provisória. Antes de continuar, escolha uma senha só sua.`
            : "Escolha uma nova senha para entrar no Dilon Zap."}
        </p>
        <TrocarSenhaForm obrigatoria={obrigatoria} />
      </div>
    </main>
  );
}
