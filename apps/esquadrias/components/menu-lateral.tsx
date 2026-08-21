"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import type { PapelUsuario, PlanoAssinatura } from "@dilon-zap/erp-db";
import { NOME_PLANO, temRecurso, type Recurso } from "@/lib/planos";
import { AlternarTema } from "./alternar-tema";

type Item = {
  href: string;
  rotulo: string;
  recurso?: Recurso;
  papeis?: PapelUsuario[];
};

const GRUPOS: Array<{ titulo: string; itens: Item[] }> = [
  {
    titulo: "Vender",
    itens: [
      { href: "/painel", rotulo: "Início" },
      { href: "/orcamentos", rotulo: "Orçamentos" },
      { href: "/clientes", rotulo: "Clientes" },
      { href: "/agenda", rotulo: "Agenda", recurso: "AGENDA" },
    ],
  },
  {
    titulo: "Produzir",
    itens: [
      { href: "/obras", rotulo: "Obras e serviços" },
      { href: "/tipologias", rotulo: "Tipologias" },
      { href: "/catalogo", rotulo: "Catálogo de insumos" },
    ],
  },
  {
    titulo: "Administrar",
    itens: [
      { href: "/financeiro", rotulo: "Financeiro", recurso: "FINANCEIRO", papeis: ["OWNER", "GERENTE", "FINANCEIRO"] },
      { href: "/relatorios", rotulo: "Relatórios", recurso: "RELATORIOS" },
      { href: "/equipe", rotulo: "Equipe", papeis: ["OWNER", "GERENTE"] },
      { href: "/configuracoes", rotulo: "Configurações", papeis: ["OWNER", "GERENTE"] },
    ],
  },
];

export function MenuLateral({
  nome,
  papel,
  plano,
  empresaNome,
}: {
  nome: string;
  papel: PapelUsuario;
  plano: PlanoAssinatura;
  empresaNome: string;
}) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);

  return (
    <>
      {/* Barra do celular. A serralheria usa o sistema no balcão e no
          canteiro de obra — o menu não pode ocupar a tela toda no telefone. */}
      <div className="md:hidden flex items-center justify-between border-b border-neutral-200 bg-surface px-4 py-3 nao-imprimir">
        <span className="font-semibold text-neutral-900">{empresaNome}</span>
        <button onClick={() => setAberto((v) => !v)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
          {aberto ? "Fechar" : "Menu"}
        </button>
      </div>

      <aside
        className={`${aberto ? "block" : "hidden"} md:flex md:w-64 shrink-0 flex-col border-r border-neutral-200 bg-surface md:h-screen md:sticky md:top-0 nao-imprimir`}
      >
        <div className="hidden md:flex items-center gap-2.5 px-5 py-5">
          <div className="h-8 w-8 rounded-lg bg-accent grid place-items-center text-white text-sm font-bold">E</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">{empresaNome}</p>
            <p className="text-xs text-neutral-500">Plano {NOME_PLANO[plano]}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
          {GRUPOS.map((grupo) => {
            const visiveis = grupo.itens.filter((i) => !i.papeis || i.papeis.includes(papel));
            if (visiveis.length === 0) return null;

            return (
              <div key={grupo.titulo}>
                <p className="px-2 mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">{grupo.titulo}</p>
                <ul className="space-y-0.5">
                  {visiveis.map((item) => {
                    const ativo = caminho === item.href || caminho.startsWith(`${item.href}/`);
                    // Item sem plano continua VISÍVEL, mas leva pra tela de
                    // upgrade. Esconder faria a serralheria nunca descobrir
                    // que o plano de corte existe — e é justamente o que ela
                    // pagaria a mais pra ter.
                    const bloqueado = item.recurso ? !temRecurso(plano, item.recurso) : false;

                    return (
                      <li key={item.href}>
                        <Link
                          href={bloqueado ? `/upgrade?recurso=${item.recurso}` : item.href}
                          onClick={() => setAberto(false)}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                            ativo ? "bg-accent/10 text-accent font-medium" : "text-neutral-700 hover:bg-neutral-100"
                          }`}
                        >
                          <span>{item.rotulo}</span>
                          {bloqueado && <span className="text-xs text-neutral-400">🔒</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-neutral-200 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-neutral-900">{nome}</p>
              <p className="text-xs text-neutral-500 capitalize">{papel.toLowerCase()}</p>
            </div>
            <AlternarTema />
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
