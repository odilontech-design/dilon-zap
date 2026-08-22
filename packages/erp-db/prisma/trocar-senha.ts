import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma-erp/client";

/**
 * Troca a senha de um usuário pela linha de comando.
 *
 * Existe porque ainda não há tela de "esqueci minha senha", e a primeira
 * coisa a fazer depois do seed é justamente sair da senha padrão — que está
 * publicada neste repositório. Sem isso, o jeito seria gerar hash na mão e
 * dar UPDATE no psql, que é onde se erra a coluna.
 *
 *   npm run erp:senha -- email@dominio.com.br "nova senha"
 */
const prisma = new PrismaClient();

async function main() {
  const [email, senha] = process.argv.slice(2);

  if (!email || !senha) {
    console.error('uso: npm run erp:senha -- email@dominio.com.br "nova senha"');
    process.exit(1);
  }
  // O mínimo é o mesmo que a API exige ao criar usuário; aceitar menos aqui
  // criaria uma porta dos fundos para senha fraca.
  if (senha.length < 8) {
    console.error("a senha precisa de pelo menos 8 caracteres");
    process.exit(1);
  }

  const usuario = await prisma.usuario.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, nome: true, empresa: { select: { nome: true } } },
  });
  if (!usuario) {
    console.error(`nenhum usuário com o email ${email}`);
    process.exit(1);
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: await bcrypt.hash(senha, 10) },
  });

  console.log(`✔ senha trocada: ${usuario.nome} (${email}) — ${usuario.empresa.nome}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
