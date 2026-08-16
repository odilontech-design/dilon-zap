"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { AppVersion } from "@/components/app-version";
import { DilonMark } from "@/components/dilon-mark";
import { ThemeToggle } from "@/components/theme-toggle";

// Ícones inline (sem lib externa: são poucos e assim não entra mais um
// pacote no bundle). Todos no mesmo padrão — traço, 24x24, herdando a cor
// do texto — pra ficarem coerentes entre si e com o resto do sistema.
const icon = (d: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-[18px] h-[18px] shrink-0"
    aria-hidden
  >
    {d}
  </svg>
);

const NAV_ITEMS = [
  {
    href: "/painel",
    label: "Painel",
    icon: icon(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  },
  {
    href: "/inbox",
    label: "Inbox",
    icon: icon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />),
  },
  {
    href: "/contatos",
    label: "Contatos",
    icon: icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>),
  },
  {
    href: "/funil",
    label: "Funil",
    icon: icon(<><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></>),
  },
  {
    href: "/relatorios",
    label: "Relatórios",
    icon: icon(<><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></>),
  },
  {
    href: "/connect",
    label: "Conectar número",
    icon: icon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M20 20h1M17 20v1" /></>),
  },
  {
    href: "/automacoes",
    label: "Automações",
    icon: icon(<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />),
  },
  {
    href: "/textos",
    label: "Textos prontos",
    icon: icon(<><path d="M4 6h16M4 12h10M4 18h7" /><path d="M17 15l2.5 2.5L23 13" /></>),
  },
  {
    href: "/etiquetas",
    label: "Etiquetas",
    icon: icon(<><path d="M20.6 13.4 12 4.8A2 2 0 0 0 10.6 4.2H5a1 1 0 0 0-1 1v5.6a2 2 0 0 0 .6 1.4l8.6 8.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.8Z" /><circle cx="7.8" cy="8" r="1.2" fill="currentColor" stroke="none" /></>),
  },
  {
    href: "/etapas",
    label: "Etapas do funil",
    icon: icon(<><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.5" /><circle cx="3.5" cy="12" r="1.5" /><circle cx="3.5" cy="18" r="1.5" /></>),
  },
  {
    href: "/bloqueios",
    label: "Bloqueios",
    icon: icon(<><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>),
  },
  {
    href: "/usuarios",
    label: "Usuários",
    icon: icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>),
    somenteResponsavel: true,
  },
];

const COLLAPSE_KEY = "dilonzap:sidebar-collapsed";

export function Sidebar({ name, role }: { name: string; role: "OWNER" | "AGENT" | "SUPERADMIN" }) {
  // `open` é só pro mobile (gaveta). No desktop a barra está sempre visível
  // e quem manda é `collapsed`, que alterna entre rótulo + ícone e só ícone.
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Lido depois da montagem, não no estado inicial: localStorage não existe
  // no servidor, e usar lá quebraria a hidratação do React.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <>
      <div className="md:hidden flex items-center justify-between border-b border-neutral-200 bg-surface px-4 h-12 sticky top-0 z-30">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="p-1 -ml-1 text-neutral-700 hover:text-accent"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        <span className="flex items-center gap-2">
          <DilonMark className="w-6 h-6" />
          <span className="text-xs font-mono uppercase tracking-wide text-accent">Dilon Zap</span>
        </span>
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
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-neutral-200 bg-surface flex flex-col transition-[transform,width] duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 ${collapsed ? "md:w-16 md:px-2 px-4" : "md:w-56 px-4"} py-4`}
      >
        {/* Recolhido, a barra tem 64px: marca e botão não cabem lado a lado,
            então viram uma coluna centralizada. */}
        <div className={`mb-6 ${collapsed ? "md:flex md:flex-col md:items-center md:gap-2" : ""}`}>
          <div className={`flex items-center gap-2 ${collapsed ? "justify-between md:justify-center" : "justify-between"}`}>
            <div className="flex items-center gap-2 min-w-0">
              <DilonMark className="w-7 h-7" />
              <p
                className={`text-xs font-mono uppercase tracking-wide text-accent whitespace-nowrap ${
                  collapsed ? "md:hidden" : ""
                }`}
              >
                Dilon Zap
              </p>
            </div>

            {/* Recolher só existe no desktop — no celular a barra já é uma
                gaveta que abre e fecha por cima do conteúdo. */}
            <button
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
              className={`hidden md:grid place-items-center w-7 h-7 rounded-md text-neutral-400 hover:text-accent hover:bg-neutral-100 ${
                collapsed ? "md:hidden" : ""
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden
              >
                <path d="M15 18 9 12l6-6" />
              </svg>
            </button>

            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="md:hidden text-neutral-400 hover:text-neutral-700 text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Versão recolhida do mesmo botão, embaixo da marca. */}
          {collapsed && (
            <button
              onClick={toggleCollapsed}
              aria-label="Expandir menu"
              title="Expandir menu"
              className="hidden md:grid place-items-center w-7 h-7 rounded-md text-neutral-400 hover:text-accent hover:bg-neutral-100"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          )}
        </div>

        <nav className="flex flex-col gap-1 text-sm overflow-y-auto">
          {NAV_ITEMS.filter((item) => !item.somenteResponsavel || role === "OWNER").map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                // O title vira a dica de qual item é quando só o ícone aparece.
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-md py-2 ${
                  collapsed ? "md:justify-center md:px-0 px-3" : "px-3"
                } ${active ? "bg-accent/10 text-accent font-medium" : "text-neutral-700 hover:bg-neutral-100"}`}
              >
                {item.icon}
                <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div
          className={`mt-auto pt-4 border-t border-neutral-200 text-xs text-neutral-500 ${
            collapsed ? "md:flex md:flex-col md:items-center" : ""
          }`}
        >
          {/* Rodapé em duas linhas, não quatro. Nome + tema em cima, sair +
              versão embaixo: numa tela baixa, quatro linhas empilhadas
              empurravam a lista de menu e criavam rolagem dentro da barra.
              O alternador aqui é só o ícone — o rótulo "Modo noite" era o
              que mais ocupava largura, e sol/lua já diz o que faz. */}
          <div className={`flex items-center gap-2 mb-1.5 ${collapsed ? "md:justify-center" : ""}`}>
            <p className={`font-medium text-neutral-700 truncate flex-1 min-w-0 ${collapsed ? "md:hidden" : ""}`}>
              {name}
            </p>
            <ThemeToggle compact />
          </div>

          <div className={`flex items-center gap-2 ${collapsed ? "md:hidden" : ""}`}>
            <div className="flex-1 min-w-0">
              <SignOutButton />
            </div>
            <AppVersion />
          </div>

          {/* Recolhida a barra tem 64px: nome e Sair já somem, e sobra só a
              versão embaixo do ícone de tema. */}
          {collapsed && (
            <div className="hidden md:block mt-2 text-center">
              <AppVersion compact />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
