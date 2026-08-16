import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "SUPERADMIN") redirect("/admin");

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <Sidebar name={user.name} role={user.role} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
