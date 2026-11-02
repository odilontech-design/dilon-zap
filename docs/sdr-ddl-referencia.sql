-- Referência para revisão. Gerado com: prisma migrate diff --from-schema-datamodel (schema do commit d2e5fff, o que está em produção) --to-schema-datamodel (schema atual) --script
-- NÃO execute à mão: quem aplicaria isto é o 'prisma db push', em um passo isolado, depois do backup, e só com autorização expressa.
-- Só cria objetos novos do SDR (controle de IA e rotina comercial): tipos, tabelas, índices e chaves para Tenant e SdrEmpresa. Não há DROP, ALTER TYPE nem alteração de tabela existente.

-- CreateEnum
CREATE TYPE "StatusUsoIaSdr" AS ENUM ('EM_ANDAMENTO', 'OK', 'ERRO', 'RESPOSTA_INVALIDA', 'BLOQUEADO', 'CACHE');

-- CreateEnum
CREATE TYPE "EtapaComercialSdr" AS ENUM ('NAO_CONTATADA', 'CONTATADA', 'RESPONDEU', 'INTERESSE', 'INFO_SOLICITADA', 'REUNIAO', 'SEM_INTERESSE', 'NAO_CONTATAR', 'CONVERTIDA');

-- CreateEnum
CREATE TYPE "ProdutoSdr" AS ENUM ('DILON_ZAP', 'DILON_FACILITIES');

-- CreateEnum
CREATE TYPE "PrioridadeSdr" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');

-- CreateEnum
CREATE TYPE "CanalSdr" AS ENUM ('EMAIL', 'LIGACAO', 'MENSAGEM', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusAbordagemSdr" AS ENUM ('RASCUNHO', 'APROVADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "TipoInteracaoSdr" AS ENUM ('CONTATO', 'RESPOSTA', 'NOTA', 'DECISOR', 'ETAPA', 'ABORDAGEM', 'CRM');

-- CreateTable
CREATE TABLE "SdrIaConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "orcamentoDiarioMicro" INTEGER,
    "orcamentoMensalMicro" INTEGER,
    "limiteTokensEntrada" INTEGER NOT NULL DEFAULT 8000,
    "limiteTokensSaida" INTEGER NOT NULL DEFAULT 1000,
    "cacheHoras" INTEGER NOT NULL DEFAULT 24,
    "modelos" JSONB NOT NULL DEFAULT '{}',
    "precos" JSONB NOT NULL DEFAULT '{}',
    "atualizadoPorId" TEXT,
    "atualizadoPorNome" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SdrIaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrIaUso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campanhaId" TEXT,
    "tarefa" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "versaoPrompt" TEXT NOT NULL,
    "status" "StatusUsoIaSdr" NOT NULL,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSaida" INTEGER NOT NULL DEFAULT 0,
    "custoMicro" INTEGER NOT NULL DEFAULT 0,
    "duracaoMs" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SdrIaUso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrIaCache" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "resposta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SdrIaCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrAcompanhamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produto" "ProdutoSdr",
    "prioridade" "PrioridadeSdr" NOT NULL DEFAULT 'MEDIA',
    "etapa" "EtapaComercialSdr" NOT NULL DEFAULT 'NAO_CONTATADA',
    "decisorNome" TEXT,
    "decisorCargo" TEXT,
    "decisorEmail" TEXT,
    "decisorTelefone" TEXT,
    "decisorLinkedin" TEXT,
    "observacoes" TEXT,
    "proximaAcao" TEXT,
    "proximaAcaoEm" TIMESTAMP(3),
    "ultimoContatoEm" TIMESTAMP(3),
    "negociacaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SdrAcompanhamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrAbordagem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "produto" "ProdutoSdr" NOT NULL,
    "canal" "CanalSdr" NOT NULL,
    "finalidade" TEXT NOT NULL DEFAULT 'PRIMEIRO_CONTATO',
    "assunto" TEXT,
    "texto" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "status" "StatusAbordagemSdr" NOT NULL DEFAULT 'RASCUNHO',
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "aprovadaEm" TIMESTAMP(3),
    "aprovadaPorId" TEXT,
    "aprovadaPorNome" TEXT,
    "textoAprovado" TEXT,
    "assuntoAprovado" TEXT,
    "versaoAprovada" INTEGER,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SdrAbordagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdrInteracao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoInteracaoSdr" NOT NULL,
    "canal" "CanalSdr",
    "abordagemId" TEXT,
    "resultado" TEXT,
    "texto" TEXT,
    "autorId" TEXT,
    "autorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SdrInteracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SdrIaConfig_tenantId_key" ON "SdrIaConfig"("tenantId");

-- CreateIndex
CREATE INDEX "SdrIaUso_tenantId_createdAt_idx" ON "SdrIaUso"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SdrIaUso_tenantId_campanhaId_createdAt_idx" ON "SdrIaUso"("tenantId", "campanhaId", "createdAt");

-- CreateIndex
CREATE INDEX "SdrIaUso_tenantId_status_createdAt_idx" ON "SdrIaUso"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SdrIaCache_expiraEm_idx" ON "SdrIaCache"("expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "SdrIaCache_tenantId_chave_key" ON "SdrIaCache"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "SdrAcompanhamento_tenantId_etapa_idx" ON "SdrAcompanhamento"("tenantId", "etapa");

-- CreateIndex
CREATE INDEX "SdrAcompanhamento_tenantId_proximaAcaoEm_idx" ON "SdrAcompanhamento"("tenantId", "proximaAcaoEm");

-- CreateIndex
CREATE UNIQUE INDEX "SdrAcompanhamento_tenantId_empresaId_key" ON "SdrAcompanhamento"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "SdrAbordagem_tenantId_empresaId_idx" ON "SdrAbordagem"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "SdrAbordagem_tenantId_status_idx" ON "SdrAbordagem"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SdrInteracao_tenantId_empresaId_createdAt_idx" ON "SdrInteracao"("tenantId", "empresaId", "createdAt");

-- AddForeignKey
ALTER TABLE "SdrIaConfig" ADD CONSTRAINT "SdrIaConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrIaUso" ADD CONSTRAINT "SdrIaUso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrIaCache" ADD CONSTRAINT "SdrIaCache_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrAcompanhamento" ADD CONSTRAINT "SdrAcompanhamento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrAcompanhamento" ADD CONSTRAINT "SdrAcompanhamento_tenantId_empresaId_fkey" FOREIGN KEY ("tenantId", "empresaId") REFERENCES "SdrEmpresa"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrAbordagem" ADD CONSTRAINT "SdrAbordagem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrAbordagem" ADD CONSTRAINT "SdrAbordagem_tenantId_empresaId_fkey" FOREIGN KEY ("tenantId", "empresaId") REFERENCES "SdrEmpresa"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrInteracao" ADD CONSTRAINT "SdrInteracao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdrInteracao" ADD CONSTRAINT "SdrInteracao_tenantId_empresaId_fkey" FOREIGN KEY ("tenantId", "empresaId") REFERENCES "SdrEmpresa"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

