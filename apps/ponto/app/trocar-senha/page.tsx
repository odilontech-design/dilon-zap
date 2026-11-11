import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/session";
import { FormularioTrocarSenha } from "./formulario";

export default async function PaginaTrocarSenha() {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  return (
    <main className="min-h-screen grid place-items-center p-5">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-surface p-6">
        <h1 className="text-lg font-semibold text-neutral-900">Crie a sua senha</h1>
        <p className="text-sm text-neutral-500 mt-1 mb-5">
          {u.trocarSenha ? "Você entrou com uma senha provisória. Escolha uma senha só sua para continuar." : "Troque a sua senha de acesso."}
        </p>
        <FormularioTrocarSenha />
      </div>
    </main>
  );
}
