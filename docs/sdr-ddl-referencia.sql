-- Referência para revisão. Gerado com: prisma migrate diff --from-schema-datamodel (schema do commit 100ee4f, o que está em produção) --to-schema-datamodel (schema atual) --script
-- NÃO execute à mão: quem aplicaria isto é o 'prisma db push', em um passo isolado, depois do backup, e só com autorização expressa.
-- Só acrescenta: 1 tipo, 1 tabela (SdrEnvioEmail), seus índices e a chave para Tenant, e o valor WHATSAPP no tipo CanalSdr (ALTER TYPE ... ADD VALUE, que não altera nenhuma linha). Não há DROP nem alteração de tabela existente.

-- CreateEnum
CREATE TYPE "StatusEnvioEmailSdr" AS ENUM ('ENVIANDO', 'ENVIADO', 'FALHOU');

-- AlterEnum
ALTER TYPE "CanalSdr" ADD VALUE 'WHATSAPP';

-- CreateTable
CREATE TABLE "SdrEnvioEmail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "abordagemId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "para" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "status" "StatusEnvioEmailSdr" NOT NULL DEFAULT 'ENVIANDO',
    "messageId" TEXT,
    "erro" TEXT,
    "enviadoPorId" TEXT,
    "enviadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SdrEnvioEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SdrEnvioEmail_tenantId_createdAt_idx" ON "SdrEnvioEmail"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SdrEnvioEmail_tenantId_status_createdAt_idx" ON "SdrEnvioEmail"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SdrEnvioEmail_tenantId_abordagemId_versao_para_key" ON "SdrEnvioEmail"("tenantId", "abordagemId", "versao", "para");

-- AddForeignKey
ALTER TABLE "SdrEnvioEmail" ADD CONSTRAINT "SdrEnvioEmail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

