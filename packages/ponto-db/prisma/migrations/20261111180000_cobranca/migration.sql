-- CreateEnum
CREATE TYPE "FormaCobranca" AS ENUM ('BOLETO_ASAAS', 'ISENTA');

-- CreateEnum
CREATE TYPE "StatusFatura" AS ENUM ('PENDENTE', 'PAGA', 'VENCIDA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "asaasCustomerId" TEXT,
ADD COLUMN     "asaasSubscriptionId" TEXT,
ADD COLUMN     "canceladaEm" TIMESTAMP(3),
ADD COLUMN     "emailCobranca" TEXT,
ADD COLUMN     "erroCobranca" TEXT,
ADD COLUMN     "formaCobranca" "FormaCobranca" NOT NULL DEFAULT 'BOLETO_ASAAS';

-- CreateTable
CREATE TABLE "Fatura" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "asaasPaymentId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "vencimento" DATE NOT NULL,
    "status" "StatusFatura" NOT NULL,
    "urlFatura" TEXT,
    "urlBoleto" TEXT,
    "linhaDigitavel" TEXT,
    "pagaEm" TIMESTAMP(3),
    "atualizadaEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_asaasPaymentId_key" ON "Fatura"("asaasPaymentId");

-- CreateIndex
CREATE INDEX "Fatura_empresaId_vencimento_idx" ON "Fatura"("empresaId", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_asaasSubscriptionId_key" ON "Empresa"("asaasSubscriptionId");

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

