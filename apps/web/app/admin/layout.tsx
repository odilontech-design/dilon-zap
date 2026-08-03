import Link from "next/link";
import { requireSuperAdmin } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-950 text-neutral-100 p-4 flex flex-col">
        <p className="text-xs font-mono uppercase tracking-wide text-emerald-400 mb-1">Dilon Zap</p>
        <p className="text-[11px] text-neutral-400 mb-6">Painel Dilon Tech</p>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/admin" className="rounded-md px-3 py-2 hover:bg-neutral-800">
            Empresas
          </Link>
          <Link href="/admin/auditoria" className="rounded-md px-3 py-2 hover:bg-neutral-800">
            Auditoria
          </Link>
        </nav>
        <div className="mt-auto pt-4 border-t border-neutral-800 text-xs text-neutral-400">
          <p className="mb-2">{user.email}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-neutral-950">{children}</main>
    </div>
  );
}
