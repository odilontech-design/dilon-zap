-- SQL que o `prisma db push` da Ótica (v1.39.0) executa no banco do Zap.
-- Gerado com `prisma migrate diff` entre o schema anterior (antes de a914a73) e o
-- da v1.39.0. Só CRIA: um enum, um valor novo em "Recurso", cinco tabelas, índices
-- e chaves estrangeiras. Nenhum DROP, nenhuma coluna mudada em tabela existente.
--
-- Uso: conferir contra o ensaio (passo 4 de docs/otica.md). Se o ensaio mostrar
-- qualquer coisa além disto, PARAR: a produção não está no commit esperado.
--
-- Atenção ao enum (a mesma pegadinha do SDR): com uma linha OTICA em
-- TenantRecurso, uma imagem ANTIGA do site quebra ao ler essa tabela. Por isso
-- o recurso só é ligado DEPOIS de o site novo estar no ar. O worker do WhatsApp
-- não lê TenantRecurso.

-- CreateEnum
CREATE TYPE "EtapaOS" AS ENUM ('ABERTA', 'LABORATORIO', 'MONTAGEM', 'CONFERENCIA', 'PRONTA', 'ENTREGUE', 'CANCELADA');

-- AlterEnum
ALTER TYPE "Recurso" ADD VALUE 'OTICA';

-- CreateTable
CREATE TABLE "OticaConfig" (
    "tenantId" TEXT NOT NULL,
    "proximoNumeroOS" INTEGER NOT NULL DEFAULT 1,
    "avisos" JSONB,
    "validadeReceitaMeses" INTEGER NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OticaConfig_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "Laboratorio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "contato" TEXT,
    "prazoDias" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Laboratorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceitaOtica" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "usuarioNome" TEXT,
    "usuarioNascimento" TIMESTAMP(3),
    "medico" TEXT,
    "crm" TEXT,
    "dataConsulta" TIMESTAMP(3),
    "validaAte" TIMESTAMP(3),
    "graus" JSONB NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceitaOtica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemServico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "contactId" TEXT NOT NULL,
    "receitaId" TEXT,
    "laboratorioId" TEXT,
    "pedidoLaboratorio" TEXT,
    "consultorId" TEXT,
    "etapa" "EtapaOS" NOT NULL DEFAULT 'ABERTA',
    "etapaDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previsaoEntrega" TIMESTAMP(3),
    "lentes" TEXT,
    "materialLente" TEXT,
    "indiceLente" TEXT,
    "tratamentos" TEXT[],
    "tratamentoCor" TEXT,
    "armacao" TEXT,
    "materialArmacao" TEXT,
    "servicos" TEXT[],
    "medidas" JSONB,
    "observacoes" TEXT,
    "valorCents" INTEGER NOT NULL DEFAULT 0,
    "sinalCents" INTEGER NOT NULL DEFAULT 0,
    "quitadaEm" TIMESTAMP(3),
    "portadorAutorizado" TEXT,
    "entregueEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdemServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoOS" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "de" "EtapaOS",
    "para" "EtapaOS" NOT NULL,
    "porId" TEXT,
    "aviso" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoOS_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Laboratorio_tenantId_nome_key" ON "Laboratorio"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "ReceitaOtica_tenantId_contactId_idx" ON "ReceitaOtica"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "OrdemServico_tenantId_etapa_idx" ON "OrdemServico"("tenantId", "etapa");

-- CreateIndex
CREATE INDEX "OrdemServico_contactId_idx" ON "OrdemServico"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemServico_tenantId_numero_key" ON "OrdemServico"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "EventoOS_ordemId_idx" ON "EventoOS"("ordemId");

-- AddForeignKey
ALTER TABLE "OticaConfig" ADD CONSTRAINT "OticaConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Laboratorio" ADD CONSTRAINT "Laboratorio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaOtica" ADD CONSTRAINT "ReceitaOtica_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaOtica" ADD CONSTRAINT "ReceitaOtica_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "ReceitaOtica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_laboratorioId_fkey" FOREIGN KEY ("laboratorioId") REFERENCES "Laboratorio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_consultorId_fkey" FOREIGN KEY ("consultorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoOS" ADD CONSTRAINT "EventoOS_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoOS" ADD CONSTRAINT "EventoOS_porId_fkey" FOREIGN KEY ("porId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

