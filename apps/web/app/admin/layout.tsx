import { requireSuperAdmin } from "@/lib/session";
import { AdminSidebar } from "@/components/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-neutral-950">
      <AdminSidebar name={user.name} />
      <main className="flex-1 min-w-0 bg-neutral-950">{children}</main>
    </div>
  );
}
