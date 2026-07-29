import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Fase 0 não tem onboarding self-service ainda (isso é Fase 4), então o
// primeiro tenant + usuário owner nasce por seed mesmo.
async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "believe-cosmeticos" },
    create: { slug: "believe-cosmeticos", name: "Believe Cosméticos" },
    update: {},
  });

  const email = "contato@believecosmeticos.com.br";
  const passwordHash = await bcrypt.hash("troque-esta-senha", 10);

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Believe Cosméticos",
      passwordHash,
      role: "OWNER",
      tenantId: tenant.id,
    },
    update: {},
  });

  console.log(`Tenant "${tenant.name}" pronto. Login: ${email} / senha: troque-esta-senha`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
