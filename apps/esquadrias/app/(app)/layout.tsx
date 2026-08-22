import { MenuLateral } from "@/components/menu-lateral";
import { requireUsuario } from "@/lib/session";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await requireUsuario();

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <MenuLateral nome={usuario.name} papel={usuario.papel} plano={usuario.plano} empresaNome={usuario.empresaNome} />
      <main className="flex-1 min-w-0 p-5 md:p-8">{children}</main>
    </div>
  );
}
