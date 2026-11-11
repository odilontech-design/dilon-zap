import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/session";
import { FormularioLogin } from "./formulario-login";

export default async function PaginaLogin() {
  if (await usuarioAtual()) redirect("/");
  return (
    <main className="min-h-screen grid place-items-center p-5">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="h-9 w-9 rounded-lg bg-accent grid place-items-center text-white font-bold">P</div>
          <div>
            <p className="font-semibold text-neutral-900">Dilon Ponto</p>
            <p className="text-xs text-neutral-500">Controle de ponto e jornada</p>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-surface p-6">
          <FormularioLogin />
        </div>
        <p className="text-sm text-neutral-500 mt-6 text-center">
          Ainda não usa?{" "}
          <Link href="/cadastro" className="text-accent font-medium">
            Contratar o plano Essencial
          </Link>
        </p>
      </div>
    </main>
  );
}
