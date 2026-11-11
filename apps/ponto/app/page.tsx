import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/session";

export default async function Inicio() {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  redirect(u.papel === "ADMIN" ? "/painel" : "/bater");
}
