import { requireSuperAdmin } from "@/lib/session";
import { SuportePanel } from "./suporte-panel";

export const metadata = { title: "Suporte · Dilon Zap" };

export default async function SuportePage() {
  const admin = await requireSuperAdmin();
  return <SuportePanel meuId={admin.id} />;
}
