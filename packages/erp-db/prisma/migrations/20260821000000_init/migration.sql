-- CreateEnum
CREATE TYPE "PlanoAssinatura" AS ENUM ('BASICO', 'ESSENCIAL', 'AVANCADO');

-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('OWNER', 'GERENTE', 'VENDEDOR', 'PRODUCAO', 'FINANCEIRO', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "CategoriaTipologia" AS ENUM ('JANELA', 'PORTA', 'BOX', 'GUARDA_CORPO', 'FACHADA', 'VITRINE', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoCorte" AS ENUM ('RETO', 'ANGULO_45', 'ANGULO_45_DUPLO');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'ENVIADO', 'APROVADO', 'REPROVADO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "StatusObra" AS ENUM ('AGUARDANDO', 'MEDICAO', 'PRODUCAO', 'PRONTO', 'INSTALACAO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "StatusLancamento" AS ENUM ('PENDENTE', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoCompromisso" AS ENUM ('MEDICAO', 'VISITA', 'INSTALACAO', 'ENTREGA', 'MANUTENCAO', 'OUTRO');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cnpj" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "logoUrl" TEXT,
    "corPrimaria" TEXT NOT NULL DEFAULT '#1B8F5E',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "plano" "PlanoAssinatura" NOT NULL DEFAULT 'BASICO',
    "trialTerminaEm" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "margemLucroPercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "maoDeObraPorM2Centavos" INTEGER NOT NULL DEFAULT 0,
    "maoDeObraPercentSobreCusto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perdaAluminioPercent" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "impostoPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "espessuraSerraMm" INTEGER NOT NULL DEFAULT 3,
    "sobraMinimaAproveitavelMm" INTEGER NOT NULL DEFAULT 300,
    "validadeOrcamentoDias" INTEGER NOT NULL DEFAULT 15,
    "condicoesPadrao" TEXT,
    "proximoNumeroOrcamento" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL DEFAULT 'VENDEDOR',
    "telefone" TEXT,
    "comissaoPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desativadoEm" TIMESTAMP(3),

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPessoa" NOT NULL DEFAULT 'FISICA',
    "documento" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "endereco" TEXT,
    "numero" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cor" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "hex" TEXT NOT NULL DEFAULT '#CCCCCC',
    "fatorAluminio" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fatorFerragem" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Cor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaPerfil" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LinhaPerfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Perfil" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "linhaId" TEXT,
    "fornecedorId" TEXT,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "pesoPorMetro" DOUBLE PRECISION NOT NULL,
    "precoPorKgCentavos" INTEGER NOT NULL,
    "comprimentoBarraMm" INTEGER NOT NULL DEFAULT 6000,
    "estoqueBarras" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vidro" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'INCOLOR',
    "espessuraMm" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "precoM2Centavos" INTEGER NOT NULL,
    "m2Minimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "temperado" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vidro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ferragem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "codigo" TEXT,
    "nome" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'pç',
    "precoUnitarioCentavos" INTEGER NOT NULL,
    "estoque" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Ferragem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tipologia" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "linhaId" TEXT,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaTipologia" NOT NULL DEFAULT 'JANELA',
    "descricao" TEXT,
    "desenhoSvg" TEXT,
    "larguraMinMm" INTEGER NOT NULL DEFAULT 300,
    "larguraMaxMm" INTEGER NOT NULL DEFAULT 6000,
    "alturaMinMm" INTEGER NOT NULL DEFAULT 300,
    "alturaMaxMm" INTEGER NOT NULL DEFAULT 6000,
    "formulaMaoDeObra" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tipologia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParametroTipologia" (
    "id" TEXT NOT NULL,
    "tipologiaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "valorPadrao" DOUBLE PRECISION NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ParametroTipologia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipologiaPeca" (
    "id" TEXT NOT NULL,
    "tipologiaId" TEXT NOT NULL,
    "perfilId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "corte" "TipoCorte" NOT NULL DEFAULT 'RETO',
    "formulaQuantidade" TEXT NOT NULL DEFAULT '1',
    "formulaComprimento" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TipologiaPeca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipologiaVidro" (
    "id" TEXT NOT NULL,
    "tipologiaId" TEXT NOT NULL,
    "vidroId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "formulaQuantidade" TEXT NOT NULL DEFAULT '1',
    "formulaLargura" TEXT NOT NULL,
    "formulaAltura" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TipologiaVidro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipologiaFerragem" (
    "id" TEXT NOT NULL,
    "tipologiaId" TEXT NOT NULL,
    "ferragemId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "formulaQuantidade" TEXT NOT NULL DEFAULT '1',
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TipologiaFerragem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT,
    "vendedorId" TEXT,
    "titulo" TEXT NOT NULL DEFAULT 'Orçamento',
    "status" "StatusOrcamento" NOT NULL DEFAULT 'RASCUNHO',
    "validoAte" TIMESTAMP(3),
    "condicoes" TEXT,
    "observacoes" TEXT,
    "descontoPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "freteCentavos" INTEGER NOT NULL DEFAULT 0,
    "descontoAplicadoCentavos" INTEGER NOT NULL DEFAULT 0,
    "subtotalCentavos" INTEGER NOT NULL DEFAULT 0,
    "totalCentavos" INTEGER NOT NULL DEFAULT 0,
    "custoCentavos" INTEGER NOT NULL DEFAULT 0,
    "lucroCentavos" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "aprovadoEm" TIMESTAMP(3),

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrcamentoItem" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "tipologiaId" TEXT,
    "descricao" TEXT NOT NULL,
    "larguraMm" INTEGER NOT NULL,
    "alturaMm" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "ambiente" TEXT,
    "observacoes" TEXT,
    "corAluminioId" TEXT,
    "corFerragemId" TEXT,
    "margemLucroPercent" DOUBLE PRECISION,
    "acrescimoCentavos" INTEGER NOT NULL DEFAULT 0,
    "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "adicionaisCentavos" INTEGER NOT NULL DEFAULT 0,
    "parametros" JSONB,
    "custoCentavos" INTEGER NOT NULL DEFAULT 0,
    "subtotalCentavos" INTEGER NOT NULL DEFAULT 0,
    "totalCentavos" INTEGER NOT NULL DEFAULT 0,
    "memoriaCalculo" JSONB,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrcamentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obra" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "orcamentoId" TEXT,
    "clienteId" TEXT,
    "responsavelId" TEXT,
    "titulo" TEXT NOT NULL,
    "status" "StatusObra" NOT NULL DEFAULT 'AGUARDANDO',
    "endereco" TEXT,
    "cidade" TEXT,
    "previsaoInicio" TIMESTAMP(3),
    "previsaoFim" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "valorCentavos" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemChecklist" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "concluidoEm" TIMESTAMP(3),
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "status" "StatusLancamento" NOT NULL DEFAULT 'PENDENTE',
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "valorCentavos" INTEGER NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "pagoEm" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "clienteId" TEXT,
    "fornecedorId" TEXT,
    "obraId" TEXT,
    "baixadoPorId" TEXT,
    "parcela" INTEGER,
    "totalParcelas" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compromisso" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoCompromisso" NOT NULL DEFAULT 'VISITA',
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3),
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "clienteId" TEXT,
    "obraId" TEXT,
    "responsavelId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compromisso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaVenda" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "competencia" TIMESTAMP(3) NOT NULL,
    "metaCentavos" INTEGER NOT NULL,

    CONSTRAINT "MetaVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAuditoria" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "atorId" TEXT,
    "atorNome" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "detalhe" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_slug_key" ON "Empresa"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_empresaId_idx" ON "Usuario"("empresaId");

-- CreateIndex
CREATE INDEX "Cliente_empresaId_nome_idx" ON "Cliente"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_empresaId_documento_key" ON "Cliente"("empresaId", "documento");

-- CreateIndex
CREATE INDEX "Fornecedor_empresaId_idx" ON "Fornecedor"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Cor_empresaId_nome_key" ON "Cor"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "LinhaPerfil_empresaId_nome_key" ON "LinhaPerfil"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "Perfil_empresaId_nome_idx" ON "Perfil"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Perfil_empresaId_codigo_key" ON "Perfil"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Vidro_empresaId_nome_key" ON "Vidro"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Ferragem_empresaId_nome_key" ON "Ferragem"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "Tipologia_empresaId_categoria_idx" ON "Tipologia"("empresaId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "Tipologia_empresaId_nome_key" ON "Tipologia"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "ParametroTipologia_tipologiaId_chave_key" ON "ParametroTipologia"("tipologiaId", "chave");

-- CreateIndex
CREATE INDEX "TipologiaPeca_tipologiaId_idx" ON "TipologiaPeca"("tipologiaId");

-- CreateIndex
CREATE INDEX "TipologiaVidro_tipologiaId_idx" ON "TipologiaVidro"("tipologiaId");

-- CreateIndex
CREATE INDEX "TipologiaFerragem_tipologiaId_idx" ON "TipologiaFerragem"("tipologiaId");

-- CreateIndex
CREATE INDEX "Orcamento_empresaId_status_idx" ON "Orcamento"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_empresaId_numero_key" ON "Orcamento"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "OrcamentoItem_orcamentoId_idx" ON "OrcamentoItem"("orcamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Obra_orcamentoId_key" ON "Obra"("orcamentoId");

-- CreateIndex
CREATE INDEX "Obra_empresaId_status_idx" ON "Obra"("empresaId", "status");

-- CreateIndex
CREATE INDEX "ItemChecklist_obraId_idx" ON "ItemChecklist"("obraId");

-- CreateIndex
CREATE INDEX "Lancamento_empresaId_status_vencimento_idx" ON "Lancamento"("empresaId", "status", "vencimento");

-- CreateIndex
CREATE INDEX "Lancamento_empresaId_tipo_idx" ON "Lancamento"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "Compromisso_empresaId_inicio_idx" ON "Compromisso"("empresaId", "inicio");

-- CreateIndex
CREATE INDEX "MetaVenda_empresaId_competencia_idx" ON "MetaVenda"("empresaId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "MetaVenda_usuarioId_competencia_key" ON "MetaVenda"("usuarioId", "competencia");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_empresaId_criadoEm_idx" ON "RegistroAuditoria"("empresaId", "criadoEm");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cor" ADD CONSTRAINT "Cor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaPerfil" ADD CONSTRAINT "LinhaPerfil_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perfil" ADD CONSTRAINT "Perfil_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perfil" ADD CONSTRAINT "Perfil_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "LinhaPerfil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Perfil" ADD CONSTRAINT "Perfil_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vidro" ADD CONSTRAINT "Vidro_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vidro" ADD CONSTRAINT "Vidro_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ferragem" ADD CONSTRAINT "Ferragem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ferragem" ADD CONSTRAINT "Ferragem_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tipologia" ADD CONSTRAINT "Tipologia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tipologia" ADD CONSTRAINT "Tipologia_linhaId_fkey" FOREIGN KEY ("linhaId") REFERENCES "LinhaPerfil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParametroTipologia" ADD CONSTRAINT "ParametroTipologia_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "Tipologia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipologiaPeca" ADD CONSTRAINT "TipologiaPeca_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "Tipologia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipologiaPeca" ADD CONSTRAINT "TipologiaPeca_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES "Perfil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipologiaVidro" ADD CONSTRAINT "TipologiaVidro_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "Tipologia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipologiaVidro" ADD CONSTRAINT "TipologiaVidro_vidroId_fkey" FOREIGN KEY ("vidroId") REFERENCES "Vidro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipologiaFerragem" ADD CONSTRAINT "TipologiaFerragem_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "Tipologia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipologiaFerragem" ADD CONSTRAINT "TipologiaFerragem_ferragemId_fkey" FOREIGN KEY ("ferragemId") REFERENCES "Ferragem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_tipologiaId_fkey" FOREIGN KEY ("tipologiaId") REFERENCES "Tipologia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_corAluminioId_fkey" FOREIGN KEY ("corAluminioId") REFERENCES "Cor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_corFerragemId_fkey" FOREIGN KEY ("corFerragemId") REFERENCES "Cor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemChecklist" ADD CONSTRAINT "ItemChecklist_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_baixadoPorId_fkey" FOREIGN KEY ("baixadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compromisso" ADD CONSTRAINT "Compromisso_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compromisso" ADD CONSTRAINT "Compromisso_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compromisso" ADD CONSTRAINT "Compromisso_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compromisso" ADD CONSTRAINT "Compromisso_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaVenda" ADD CONSTRAINT "MetaVenda_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaVenda" ADD CONSTRAINT "MetaVenda_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAuditoria" ADD CONSTRAINT "RegistroAuditoria_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

