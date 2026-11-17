import { requireSuperAdmin } from "@/lib/session";
import { JanelaWhatsappPanel } from "./janela-panel";

export const metadata = { title: "Janela do WhatsApp · Dilon Zap" };

export default async function JanelaWhatsappPage() {
  await requireSuperAdmin();
  return <JanelaWhatsappPanel />;
}
