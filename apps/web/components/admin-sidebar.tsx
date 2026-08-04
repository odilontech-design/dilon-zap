"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";

const NAV_ITEMS = [
  { href: "/admin", label: "Empresas" },
  { href: "/admin/auditoria", label: "Auditoria" },
];

export function AdminSidebar({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <div className="md:hidden flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 h-12 sticky top-0 z-30">
        <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="p-1 -ml-1 text-neutral-300 hover:text-emerald-400">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        <span className="text-xs font-mono uppercase tracking-wide text-emerald-400">Dilon Zap · Admin</span>
        <span className="w-6" aria-hidden />
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 md:w-56 shrink-0 border-r border-neutral-800 bg-neutral-950 text-neutral-100 p-4 flex flex-col transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-mono uppercase tracking-wide text-emerald-400">Dilon Zap</p>
          <button
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="md:hidden text-neutral-400 hover:text-neutral-200 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <p className="text-[11px] text-neutral-400 mb-6">Painel Dilon Tech</p>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`rounded-md px-3 py-2 ${active ? "bg-neutral-800 text-emerald-400 font-medium" : "hover:bg-neutral-800"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-4 border-t border-neutral-800 text-xs text-neutral-400">
          <p className="mb-2 font-medium text-neutral-200 truncate">{name}</p>
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}
