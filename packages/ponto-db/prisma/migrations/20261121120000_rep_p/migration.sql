-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "cnoOuCaepf" TEXT,
ADD COLUMN     "endereco" TEXT;

-- AlterTable
ALTER TABLE "Marcacao" ADD COLUMN     "hashRep" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "cpf" TEXT;

-- CreateTable
CREATE TABLE "RegistroRep" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nsr" INTEGER NOT NULL,
    "tipo" INTEGER NOT NULL,
    "dados" JSONB NOT NULL,
    "gravadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroRep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroRep_empresaId_tipo_idx" ON "RegistroRep"("empresaId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroRep_empresaId_nsr_key" ON "RegistroRep"("empresaId", "nsr");

-- AddForeignKey
ALTER TABLE "RegistroRep" ADD CONSTRAINT "RegistroRep_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Registro do REP imutável ────────────────────────────────────────────────
-- Anexo IX, item 7: os dados do Armazenamento de Registro de Ponto não podem
-- ser apagados nem alterados. Mesma regra da Marcacao.
CREATE OR REPLACE FUNCTION ponto_registro_rep_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registro do REP é imutável (NSR %)', OLD."nsr";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RegistroRep_imutavel"
  BEFORE UPDATE OR DELETE ON "RegistroRep"
  FOR EACH ROW EXECUTE FUNCTION ponto_registro_rep_imutavel();
