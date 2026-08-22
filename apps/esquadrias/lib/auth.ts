import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/erp-db";

// Sem adapter, igual ao apps/web: só existe login por email+senha, e o
// adapter do NextAuth exigiria tabelas Account/Session que este schema não
// tem. Se um dia entrar login social, entram os dois juntos.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email e senha",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const usuario = await prisma.usuario.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          include: { empresa: { select: { ativa: true, nome: true, plano: true } } },
        });
        if (!usuario) return null;

        // Desativado não entra, e empresa suspensa também não. As duas
        // checagens ficam ANTES da senha conferir, pra não existir caminho em
        // que a senha bate e o acesso passa mesmo assim.
        if (usuario.desativadoEm) return null;
        if (!usuario.empresa.ativa) return null;

        const valida = await bcrypt.compare(credentials.password, usuario.senhaHash);
        if (!valida) return null;

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          papel: usuario.papel,
          empresaId: usuario.empresaId,
          empresaNome: usuario.empresa.nome,
          plano: usuario.empresa.plano,
        } as never;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        const u = user as unknown as Record<string, string>;
        token.papel = u.papel;
        token.empresaId = u.empresaId;
        token.empresaNome = u.empresaNome;
        token.plano = u.plano;
      }

      // O plano muda por fora da sessão (upgrade pago, assinatura suspensa) e
      // o JWT duraria 30 dias com o valor velho — o cliente pagaria o
      // AVANÇADO e continuaria sem plano de corte. Na atualização de sessão,
      // relê do banco.
      if (trigger === "update" && token.sub) {
        const atual = await prisma.usuario.findUnique({
          where: { id: token.sub },
          include: { empresa: { select: { plano: true, nome: true } } },
        });
        if (atual) {
          token.papel = atual.papel;
          token.plano = atual.empresa.plano;
          token.empresaNome = atual.empresa.nome;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as unknown as Record<string, unknown>;
        u.id = token.sub;
        u.papel = token.papel;
        u.empresaId = token.empresaId;
        u.empresaNome = token.empresaNome;
        u.plano = token.plano;
      }
      return session;
    },
  },
};
