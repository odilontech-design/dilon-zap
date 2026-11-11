-- CreateEnum
CREATE TYPE "Plano" AS ENUM ('ESSENCIAL', 'PONTO', 'PONTO_DP', 'RH_COMPLETO');

-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'GESTOR', 'COLABORADOR');

-- CreateEnum
CREATE TYPE "ModoRegistro" AS ENUM ('SIMPLES', 'COM_FOTO');

-- CreateEnum
CREATE TYPE "CanalMarcacao" AS ENUM ('APP', 'WEB');

-- CreateEnum
CREATE TYPE "TipoTratamento" AS ENUM ('INCLUSAO', 'DESCONSIDERACAO');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "plano" "Plano" NOT NULL DEFAULT 'ESSENCIAL',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "nsrAtual" INTEGER NOT NULL DEFAULT 0,
    "toleranciaPorMarcacaoMin" INTEGER NOT NULL DEFAULT 5,
    "toleranciaDiariaMin" INTEGER NOT NULL DEFAULT 10,
    "percentualExtraBp" INTEGER NOT NULL DEFAULT 5000,
    "percentualDescansoBp" INTEGER NOT NULL DEFAULT 10000,
    "percentualNoturnoBp" INTEGER NOT NULL DEFAULT 2000,
    "bancoDeHoras" BOOLEAN NOT NULL DEFAULT false,
    "validadeBancoDias" INTEGER NOT NULL DEFAULT 180,
    "exigirLocalizacao" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "trocarSenha" BOOLEAN NOT NULL DEFAULT false,
    "colaboradorId" TEXT,
    "desativadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jornada" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "semana" JSONB NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Jornada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "pis" TEXT,
    "matricula" TEXT,
    "cargo" TEXT,
    "admissao" DATE NOT NULL,
    "jornadaId" TEXT NOT NULL,
    "modoRegistro" "ModoRegistro" NOT NULL DEFAULT 'SIMPLES',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "desligadoEm" DATE,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marcacao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "nsr" INTEGER NOT NULL,
    "instante" TIMESTAMP(3) NOT NULL,
    "instanteDispositivo" TIMESTAMP(3),
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "canal" "CanalMarcacao" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "precisaoM" DOUBLE PRECISION,
    "fotoChave" TEXT,
    "revisar" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "idempotencia" TEXT NOT NULL,
    "hashAnterior" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Marcacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarcacaoFoto" (
    "marcacaoId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "MarcacaoFoto_pkey" PRIMARY KEY ("marcacaoId")
);

-- CreateTable
CREATE TABLE "Tratamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" "TipoTratamento" NOT NULL,
    "instante" TIMESTAMP(3),
    "marcacaoId" TEXT,
    "motivo" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "revogadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tratamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abono" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "minutos" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Abono_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feriado" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Feriado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "usuarioNome" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "dados" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_cnpj_key" ON "Empresa"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_login_key" ON "Usuario"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_colaboradorId_key" ON "Usuario"("colaboradorId");

-- CreateIndex
CREATE INDEX "Usuario_empresaId_idx" ON "Usuario"("empresaId");

-- CreateIndex
CREATE INDEX "Jornada_empresaId_idx" ON "Jornada"("empresaId");

-- CreateIndex
CREATE INDEX "Colaborador_empresaId_ativo_idx" ON "Colaborador"("empresaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_empresaId_cpf_key" ON "Colaborador"("empresaId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Marcacao_idempotencia_key" ON "Marcacao"("idempotencia");

-- CreateIndex
CREATE INDEX "Marcacao_colaboradorId_instante_idx" ON "Marcacao"("colaboradorId", "instante");

-- CreateIndex
CREATE UNIQUE INDEX "Marcacao_empresaId_nsr_key" ON "Marcacao"("empresaId", "nsr");

-- CreateIndex
CREATE INDEX "Tratamento_colaboradorId_instante_idx" ON "Tratamento"("colaboradorId", "instante");

-- CreateIndex
CREATE INDEX "Tratamento_marcacaoId_idx" ON "Tratamento"("marcacaoId");

-- CreateIndex
CREATE INDEX "Abono_colaboradorId_data_idx" ON "Abono"("colaboradorId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "Feriado_empresaId_data_key" ON "Feriado"("empresaId", "data");

-- CreateIndex
CREATE INDEX "LogAuditoria_empresaId_criadoEm_idx" ON "LogAuditoria"("empresaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jornada" ADD CONSTRAINT "Jornada_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "Jornada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marcacao" ADD CONSTRAINT "Marcacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marcacao" ADD CONSTRAINT "Marcacao_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarcacaoFoto" ADD CONSTRAINT "MarcacaoFoto_marcacaoId_fkey" FOREIGN KEY ("marcacaoId") REFERENCES "Marcacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tratamento" ADD CONSTRAINT "Tratamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tratamento" ADD CONSTRAINT "Tratamento_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tratamento" ADD CONSTRAINT "Tratamento_marcacaoId_fkey" FOREIGN KEY ("marcacaoId") REFERENCES "Marcacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feriado" ADD CONSTRAINT "Feriado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Marcação imutável ───────────────────────────────────────────────────────
-- A Portaria MTP 671/2021 exige que a marcação original seja preservada. Não
-- basta o código não editar: um UPDATE esquecido num script de manutenção
-- apagaria a prova. O gatilho recusa qualquer alteração ou exclusão, venha de
-- onde vier. Correção é Tratamento.
CREATE OR REPLACE FUNCTION ponto_marcacao_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Marcação de ponto é imutável: registre um tratamento em vez de alterar ou excluir (NSR %)', OLD."nsr";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Marcacao_imutavel"
  BEFORE UPDATE OR DELETE ON "Marcacao"
  FOR EACH ROW EXECUTE FUNCTION ponto_marcacao_imutavel();

CREATE OR REPLACE FUNCTION ponto_marcacao_imutavel_foto() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Foto de marcação é imutável';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MarcacaoFoto_imutavel"
  BEFORE UPDATE OR DELETE ON "MarcacaoFoto"
  FOR EACH ROW EXECUTE FUNCTION ponto_marcacao_imutavel_foto();
