-- Referência para revisão. Gerado com: prisma migrate diff --from-schema-datamodel (schema do commit f57d844, o que está em produção) --to-schema-datamodel (schema atual) --script
-- NÃO execute à mão: quem aplica isto é o 'prisma db push', em um passo isolado, depois do backup.
-- Só cria objetos novos, mais um ALTER TYPE "Recurso" ADD VALUE 'SDR'. Não há DROP nem alteração de tabela existente.

-- CreateEnum
CREATE TYPE "StatusCampanhaSdr" AS ENUM ('RASCUNHO', 'ATIVA', 'PAUSADA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "StatusProspectoSdr" AS ENUM ('PENDENTE', 'QUALIFICADO', 'NAO_QUALIFICADO', 'VERIFICAR');

-- CreateEnum
CREATE TYPE "StatusImportacaoSdr" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'CONCLUIDA_COM_ERROS', 'FALHOU');

-- CreateEnum
CREATE TYPE "StatusLinhaSdr" AS ENUM ('PENDENTE', 'IMPORTADA', 'ATUALIZADA', 'DUPLICADA', 'INVALIDA', 'FALHOU');

-- CreateEnum
CREATE TYPE "TipoSupressaoSdr" AS ENUM ('CNPJ', 'DOMINIO', 'EMAIL', 'TELEFONE');

-- CreateEnum
CREATE TYPE "MotivoSupressaoSdr" AS ENUM ('EMPRESA_BLOQUEADA', 'SOLICITOU_NAO_CONTATO', 'OPOSICAO', 'RESTRICAO');

-- CreateEnum
CREATE TYPE "StatusTrabalhoSdr" AS ENUM ('PENDENTE', 'EM_PROCESSAMENTO', 'CONCLUIDO', 'FALHOU');

-- CreateEnum
CREATE TYPE "TipoTrabalhoSdr" AS ENUM ('IMPORTAR', 'QUALIFICAR');

-- AlterEnum
ALTER TYPE "Recurso" ADD VALUE 'SDR';

-- CreateTable
CREATE TABLE "SdrIcp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "segmentos" TEXT[],
    "cnaes" TEXT[],
    "ufs" TEXT[],
    "cidades" TEXT[],
    "portes" TEXT[],
    "caracteristicas" TEXT[],
    "criterios" JSONB NOT NULL DEFAULT '[]',
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SdrIcp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrCampanha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "StatusCampanhaSdr" NOT NULL DEFAULT 'RASCUNHO',
    "icpId" TEXT NOT NULL,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SdrCampanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrEmpresa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "site" TEXT,
    "dominio" TEXT,
    "emailDominio" TEXT,
    "uf" TEXT,
    "cidade" TEXT,
    "segmento" TEXT,
    "porte" TEXT,
    "cnae" TEXT,
    "chaveNome" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'CSV',
    "verificadaEm" TIMESTAMP(3),
    "importacaoOrigemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SdrEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrProspecto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "campanhaId" TEXT NOT NULL,
    "icpId" TEXT NOT NULL,
    "status" "StatusProspectoSdr" NOT NULL DEFAULT 'PENDENTE',
    "pontuacao" INTEGER,
    "cobertura" INTEGER,
    "criterios" JSONB,
    "qualificadoEm" TIMESTAMP(3),
    "importacaoOrigemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SdrProspecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrImportacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "hashArquivo" TEXT NOT NULL,
    "campanhaId" TEXT,
    "mapeamento" JSONB NOT NULL,
    "delimitador" TEXT NOT NULL,
    "status" "StatusImportacaoSdr" NOT NULL DEFAULT 'PENDENTE',
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "invalidas" INTEGER NOT NULL DEFAULT 0,
    "importadas" INTEGER NOT NULL DEFAULT 0,
    "atualizadas" INTEGER NOT NULL DEFAULT 0,
    "duplicadas" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "pendentes" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "SdrImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrImportacaoLinha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusLinhaSdr" NOT NULL DEFAULT 'PENDENTE',
    "bruto" JSONB NOT NULL,
    "normalizado" JSONB,
    "erros" TEXT[],
    "avisos" TEXT[],
    "empresaId" TEXT,
    "duplicadaPor" TEXT,
    "mudancas" JSONB,
    "conflitos" JSONB,
    "suprimida" BOOLEAN NOT NULL DEFAULT false,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erroProcessamento" TEXT,
    "processadaEm" TIMESTAMP(3),

    CONSTRAINT "SdrImportacaoLinha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrSupressao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoSupressaoSdr" NOT NULL,
    "valor" TEXT NOT NULL,
    "motivo" "MotivoSupressaoSdr" NOT NULL,
    "observacao" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SdrSupressao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrTrabalho" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoTrabalhoSdr" NOT NULL,
    "chave" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "StatusTrabalhoSdr" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "maxTentativas" INTEGER NOT NULL DEFAULT 3,
    "proximaTentativaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueadoPor" TEXT,
    "leaseAte" TIMESTAMP(3),
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "SdrTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SdrIcp_tenantId_nome_key" ON "SdrIcp"("tenantId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "SdrIcp_tenantId_id_key" ON "SdrIcp"("tenantId", "id");

-- CreateIndex
CREATE INDEX "SdrCampanha_tenantId_status_idx" ON "SdrCampanha"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SdrCampanha_tenantId_icpId_idx" ON "SdrCampanha"("tenantId", "icpId");

-- CreateIndex
CREATE UNIQUE INDEX "SdrCampanha_tenantId_nome_key" ON "SdrCampanha"("tenantId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "SdrCampanha_tenantId_id_key" ON "SdrCampanha"("tenantId", "id");

-- CreateIndex
CREATE INDEX "SdrEmpresa_tenantId_chaveNome_idx" ON "SdrEmpresa"("tenantId", "chaveNome");

-- CreateIndex
CREATE INDEX "SdrEmpresa_tenantId_dominio_idx" ON "SdrEmpresa"("tenantId", "dominio");

-- CreateIndex
CREATE INDEX "SdrEmpresa_tenantId_emailDominio_idx" ON "SdrEmpresa"("tenantId", "emailDominio");

-- CreateIndex
CREATE INDEX "SdrEmpresa_tenantId_email_idx" ON "SdrEmpresa"("tenantId", "email");

-- CreateIndex
CREATE INDEX "SdrEmpresa_tenantId_telefone_idx" ON "SdrEmpresa"("tenantId", "telefone");

-- CreateIndex
CREATE INDEX "SdrEmpresa_tenantId_uf_idx" ON "SdrEmpresa"("tenantId", "uf");

-- CreateIndex
CREATE UNIQUE INDEX "SdrEmpresa_tenantId_cnpj_key" ON "SdrEmpresa"("tenantId", "cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "SdrEmpresa_tenantId_id_key" ON "SdrEmpresa"("tenantId", "id");

-- CreateIndex
CREATE INDEX "SdrProspecto_tenantId_campanhaId_status_idx" ON "SdrProspecto"("tenantId", "campanhaId", "status");

-- CreateIndex
CREATE INDEX "SdrProspecto_tenantId_icpId_idx" ON "SdrProspecto"("tenantId", "icpId");

-- CreateIndex
CREATE UNIQUE INDEX "SdrProspecto_tenantId_empresaId_campanhaId_key" ON "SdrProspecto"("tenantId", "empresaId", "campanhaId");

-- CreateIndex
CREATE INDEX "SdrImportacao_tenantId_createdAt_idx" ON "SdrImportacao"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SdrImportacao_tenantId_hashArquivo_idx" ON "SdrImportacao"("tenantId", "hashArquivo");

-- CreateIndex
CREATE UNIQUE INDEX "SdrImportacao_tenantId_chave_key" ON "SdrImportacao"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "SdrImportacaoLinha_tenantId_importacaoId_status_idx" ON "SdrImportacaoLinha"("tenantId", "importacaoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SdrImportacaoLinha_importacaoId_numero_key" ON "SdrImportacaoLinha"("importacaoId", "numero");

-- CreateIndex
CREATE INDEX "SdrSupressao_tenantId_createdAt_idx" ON "SdrSupressao"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SdrSupressao_tenantId_tipo_valor_key" ON "SdrSupressao"("tenantId", "tipo", "valor");

-- CreateIndex
CREATE INDEX "SdrTrabalho_status_proximaTentativaEm_idx" ON "SdrTrabalho"("status", "proximaTentativaEm");

-- CreateIndex
CREATE INDEX "SdrTrabalho_status_leaseAte_idx" ON "SdrTrabalho"("status", "leaseAte");

-- CreateIndex
CREATE UNIQUE INDEX "SdrTrabalho_tenantId_chave_key" ON "SdrTrabalho"("tenantId", "chave");

-- AddForeignKey
ALTER TABLE "SdrIcp" ADD CONSTRAINT "SdrIcp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrCampanha" ADD CONSTRAINT "SdrCampanha_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrCampanha" ADD CONSTRAINT "SdrCampanha_tenantId_icpId_fkey" FOREIGN KEY ("tenantId", "icpId") REFERENCES "SdrIcp"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrEmpresa" ADD CONSTRAINT "SdrEmpresa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrProspecto" ADD CONSTRAINT "SdrProspecto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrProspecto" ADD CONSTRAINT "SdrProspecto_tenantId_empresaId_fkey" FOREIGN KEY ("tenantId", "empresaId") REFERENCES "SdrEmpresa"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrProspecto" ADD CONSTRAINT "SdrProspecto_tenantId_campanhaId_fkey" FOREIGN KEY ("tenantId", "campanhaId") REFERENCES "SdrCampanha"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrProspecto" ADD CONSTRAINT "SdrProspecto_tenantId_icpId_fkey" FOREIGN KEY ("tenantId", "icpId") REFERENCES "SdrIcp"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrImportacao" ADD CONSTRAINT "SdrImportacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrImportacaoLinha" ADD CONSTRAINT "SdrImportacaoLinha_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrImportacaoLinha" ADD CONSTRAINT "SdrImportacaoLinha_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "SdrImportacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrSupressao" ADD CONSTRAINT "SdrSupressao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrTrabalho" ADD CONSTRAINT "SdrTrabalho_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

