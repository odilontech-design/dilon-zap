"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";

const NAV_ITEMS = [
  { href: "/painel", label: "Painel" },
  { href: "/inbox", label: "Inbox" },
  { href: "/contatos", label: "Contatos" },
  { href: "/funil", label: "Funil" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/connect", label: "Conectar número" },
  { href: "/automacoes", label: "Automações" },
  { href: "/etiquetas", label: "Etiquetas" },
  { href: "/bloqueios", label: "Bloqueios" },
];

export function Sidebar({ email }: { email: string }) {
  // Fechado por padrão — no desktop (md:) fica sempre visível via CSS,
  // independente desse estado; ele só controla o comportamento no mobile.
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <div className="md:hidden flex items-center justify-between border-b border-neutral-200 bg-white px-4 h-12 sticky top-0 z-30">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="p-1 -ml-1 text-neutral-700 hover:text-accent"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        <span className="text-xs font-mono uppercase tracking-wide text-accent">Dilon Zap</span>
        <span className="w-6" aria-hidden />
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 md:w-56 shrink-0 border-r border-neutral-200 bg-white p-4 flex flex-col transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs font-mono uppercase tracking-wide text-accent">Dilon Zap</p>
          <button
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="md:hidden text-neutral-400 hover:text-neutral-700 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <nav className="flex flex-col gap-1 text-sm overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`rounded-md px-3 py-2 ${
                  active ? "bg-accent/10 text-accent font-medium" : "hover:bg-neutral-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-4 border-t border-neutral-200 text-xs text-neutral-500">
          <p className="mb-2 break-all">{email}</p>
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
