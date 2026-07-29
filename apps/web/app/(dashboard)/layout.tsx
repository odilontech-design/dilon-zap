import Link from "next/link";
import { requireUser } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-neutral-200 bg-white p-4 flex flex-col">
        <p className="text-xs font-mono uppercase tracking-wide text-accent mb-6">Dilon Zap</p>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/inbox" className="rounded-md px-3 py-2 hover:bg-neutral-100">
            Inbox
          </Link>
          <Link href="/connect" className="rounded-md px-3 py-2 hover:bg-neutral-100">
            Conectar número
          </Link>
          <Link href="/automacoes" className="rounded-md px-3 py-2 hover:bg-neutral-100">
            Automações
          </Link>
          <Link href="/bloqueios" className="rounded-md px-3 py-2 hover:bg-neutral-100">
            Bloqueios
          </Link>
        </nav>
        <div className="mt-auto pt-4 border-t border-neutral-200 text-xs text-neutral-500">
          <p className="mb-2">{user.email}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
