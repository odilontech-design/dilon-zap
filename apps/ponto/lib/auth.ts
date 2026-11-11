import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/ponto-db";
import { soDigitos } from "@/lib/documentos";

/**
 * Login por email (administrador) ou CPF (colaborador), com senha.
 *
 * O cookie tem nome próprio: em desenvolvimento os três produtos rodam em
 * localhost (portas diferentes, mesmo host), e cookie não separa por porta.
 * Com o nome padrão, entrar no Esquadrias derrubaria a sessão do Ponto.
 */
export function normalizarLogin(bruto: string): string {
  const t = bruto.trim().toLowerCase();
  return t.includes("@") ? t : soDigitos(t);
}

const producao = process.env.NODE_ENV === "production";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: producao ? "__Secure-ponto.session-token" : "ponto.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: producao },
    },
  },
  providers: [
    CredentialsProvider({
      name: "Login e senha",
      credentials: {
        login: { label: "Email ou CPF", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.login || !credentials?.password) return null;

        let usuario;
        try {
          usuario = await prisma.usuario.findUnique({
            where: { login: normalizarLogin(credentials.login) },
            include: { empresa: { select: { ativa: true } }, colaborador: { select: { ativo: true } } },
          });
        } catch (err) {
          // Banco fora do ar não é "senha incorreta". Ver apps/esquadrias/lib/auth.ts.
          console.error("[login] falha ao consultar o banco", err);
          throw new Error("BANCO_INDISPONIVEL");
        }

        if (!usuario || usuario.desativadoEm || !usuario.empresa.ativa) return null;
        if (usuario.colaborador && !usuario.colaborador.ativo) return null;
        if (!(await bcrypt.compare(credentials.password, usuario.senhaHash))) return null;

        return { id: usuario.id, name: usuario.nome } as never;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = (user as { id: string }).id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.sub;
      return session;
    },
  },
};
