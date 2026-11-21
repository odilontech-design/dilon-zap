-- CreateEnum
CREATE TYPE "TipoSolicitacao" AS ENUM ('INCLUSAO', 'DESCONSIDERACAO', 'ABONO', 'ATESTADO');

-- CreateEnum
CREATE TYPE "StatusSolicitacao" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Abono" ADD COLUMN     "solicitacaoId" TEXT;

-- AlterTable
ALTER TABLE "Tratamento" ADD COLUMN     "solicitacaoId" TEXT;

-- CreateTable
CREATE TABLE "Solicitacao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" "TipoSolicitacao" NOT NULL,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'PENDENTE',
    "data" DATE NOT NULL,
    "dataFim" DATE,
    "hora" TEXT,
    "diaSeguinte" BOOLEAN NOT NULL DEFAULT false,
    "marcacaoId" TEXT,
    "minutos" INTEGER,
    "justificativa" TEXT NOT NULL,
    "anexoChave" TEXT,
    "anexoNome" TEXT,
    "anexoMime" TEXT,
    "autorId" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "decididoEm" TIMESTAMP(3),
    "decididoPor" TEXT,
    "resposta" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Solicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoAnexo" (
    "solicitacaoId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "SolicitacaoAnexo_pkey" PRIMARY KEY ("solicitacaoId")
);

-- CreateIndex
CREATE INDEX "Solicitacao_empresaId_status_criadoEm_idx" ON "Solicitacao"("empresaId", "status", "criadoEm");

-- CreateIndex
CREATE INDEX "Solicitacao_colaboradorId_criadoEm_idx" ON "Solicitacao"("colaboradorId", "criadoEm");

-- AddForeignKey
ALTER TABLE "Tratamento" ADD CONSTRAINT "Tratamento_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "Solicitacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "Solicitacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitacao" ADD CONSTRAINT "Solicitacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitacao" ADD CONSTRAINT "Solicitacao_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoAnexo" ADD CONSTRAINT "SolicitacaoAnexo_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "Solicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

