import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/inbox");

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-mono uppercase tracking-wide text-accent mb-2">Dilon Zap</p>
        <h1 className="text-xl font-semibold mb-6">Entrar</h1>
        <LoginForm />
      </div>
    </div>
  );
}
