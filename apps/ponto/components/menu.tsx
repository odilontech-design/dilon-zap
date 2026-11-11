"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { AlternarTema } from "./alternar-tema";

const ITENS = [
  { href: "/painel", rotulo: "Início" },
  { href: "/ponto", rotulo: "Controle de ponto" },
  { href: "/colaboradores", rotulo: "Colaboradores" },
  { href: "/jornadas", rotulo: "Jornadas" },
  { href: "/relatorios", rotulo: "Relatórios" },
  { href: "/configuracoes", rotulo: "Configurações" },
];

export function MenuAdmin({ nome, empresa, plano, temColaborador }: { nome: string; empresa: string; plano: string; temColaborador: boolean }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <div className="md:hidden flex items-center justify-between border-b border-neutral-200 bg-surface px-4 py-3 nao-imprimir">
        <span className="font-semibold text-neutral-900 truncate">{empresa}</span>
        <button onClick={() => setAberto((v) => !v)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
          {aberto ? "Fechar" : "Menu"}
        </button>
      </div>

      <aside
        className={`${aberto ? "block" : "hidden"} md:flex md:w-60 shrink-0 flex-col border-r border-neutral-200 bg-surface md:h-screen md:sticky md:top-0 nao-imprimir`}
      >
        <div className="hidden md:flex items-center gap-2.5 px-5 py-5">
          <div className="h-8 w-8 rounded-lg bg-accent grid place-items-center text-white text-sm font-bold">P</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">{empresa}</p>
            <p className="text-xs text-neutral-500">Plano {plano}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <ul className="space-y-0.5">
            {ITENS.map((item) => {
              const ativo = caminho === item.href || caminho.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setAberto(false)}
                    className={`block rounded-lg px-3 py-2 text-sm ${ativo ? "bg-accent/10 text-accent font-medium" : "text-neutral-700 hover:bg-neutral-100"}`}
                  >
                    {item.rotulo}
                  </Link>
                </li>
              );
            })}
            {temColaborador && (
              <li className="pt-3">
                <Link href="/bater" className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
                  Bater o meu ponto
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <div className="border-t border-neutral-200 px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-neutral-900">{nome}</p>
            <div className="flex gap-3 text-xs">
              <Link href="/trocar-senha" className="text-neutral-500 hover:text-accent">
                Senha
              </Link>
              <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-neutral-500 hover:text-accent">
                Sair
              </button>
            </div>
          </div>
          <AlternarTema />
        </div>
      </aside>
    </>
  );
}

export function BarraColaborador({ nome, empresa, admin }: { nome: string; empresa: string; admin: boolean }) {
  const caminho = usePathname();
  const aba = (href: string, rotulo: string) => (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm ${caminho.startsWith(href) ? "bg-accent/10 text-accent font-medium" : "text-neutral-700"}`}
    >
      {rotulo}
    </Link>
  );
  return (
    <header className="border-b border-neutral-200 bg-surface nao-imprimir">
      <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900 truncate">{nome}</p>
          <p className="text-xs text-neutral-500 truncate">{empresa}</p>
        </div>
        <div className="flex items-center gap-1">
          <AlternarTema />
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm text-neutral-500 px-2">
            Sair
          </button>
        </div>
      </div>
      <nav className="mx-auto max-w-2xl px-4 pb-2 flex gap-1">
        {aba("/bater", "Bater ponto")}
        {aba("/meu-ponto", "Meu ponto")}
        {admin && aba("/painel", "Administração")}
      </nav>
    </header>
  );
}
