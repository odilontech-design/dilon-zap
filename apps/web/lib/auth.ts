import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/db";
import { logAudit } from "./audit";

// Sem adapter de propósito: só temos Credentials (email+senha) por enquanto,
// e o adapter do NextAuth exige tabelas Account/Session/VerificationToken
// que não existem no nosso schema. Se um dia entrar login social, adiciona
// os dois juntos.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email e senha",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).tenantId = token.tenantId;
      }
      return session;
    },
  },
  events: {
    // Estratégia JWT não bate no adapter (não tem tabela Session), então
    // esse evento só dispara no login de verdade — não em toda requisição
    // autenticada — o que é exatamente o que a trilha de auditoria precisa.
    async signIn({ user }) {
      const u = user as unknown as { id: string; name: string; email: string; tenantId: string };
      await logAudit({ actor: { id: u.id, name: u.name, email: u.email, tenantId: u.tenantId }, action: "login" });
    },
  },
};
