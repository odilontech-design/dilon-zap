/**
 * Gera os Atestados Técnicos e Termos de Responsabilidade (REP-P e PTRP) de
 * uma empresa cliente, para os responsáveis da Dilon Tech assinarem com o
 * e-CPF e entregarem ao cliente. Uso (na raiz do monorepo):
 *
 *   npm run ponto:atrt -- 61948648000189
 *
 * Lê do .env: PONTO_DESENVOLVEDOR_*, PONTO_REGISTRO_INPI,
 * PONTO_CERTIFICADO_INPI, PONTO_RESPONSAVEL_LEGAL_NOME/CPF e
 * PONTO_RESPONSAVEL_TECNICO_NOME/CPF. Os PDFs saem na pasta atual.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "@dilon-zap/ponto-db";
import { gerarAtrt } from "../lib/atrt";
import { pendenciasDoRep } from "../lib/rep-arquivos";

async function main() {
  const cnpj = (process.argv[2] ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) throw new Error("Informe o CNPJ da empresa cliente: npm run ponto:atrt -- <CNPJ>");
  const empresa = await prisma.empresa.findUnique({ where: { cnpj } });
  if (!empresa) throw new Error(`Nenhuma empresa com o CNPJ ${cnpj}.`);

  const env = (k: string) => process.env[k] ?? "";
  const faltando = pendenciasDoRep().filter((p) => !p.includes("certificado digital"));
  for (const k of ["PONTO_RESPONSAVEL_LEGAL_NOME", "PONTO_RESPONSAVEL_LEGAL_CPF", "PONTO_RESPONSAVEL_TECNICO_NOME", "PONTO_RESPONSAVEL_TECNICO_CPF"]) {
    if (!env(k)) faltando.push(k);
  }
  if (faltando.length) throw new Error(`Faltam no .env: ${faltando.join(", ")}`);

  for (const tipo of ["REP-P", "PTRP"] as const) {
    const pdf = await gerarAtrt({
      tipo,
      destinataria: { razaoSocial: empresa.razaoSocial, cnpj: empresa.cnpj },
      responsavelLegal: { nome: env("PONTO_RESPONSAVEL_LEGAL_NOME"), cpf: env("PONTO_RESPONSAVEL_LEGAL_CPF") },
      responsavelTecnico: { nome: env("PONTO_RESPONSAVEL_TECNICO_NOME"), cpf: env("PONTO_RESPONSAVEL_TECNICO_CPF") },
      certificadoInpi: env("PONTO_CERTIFICADO_INPI"),
    });
    const arquivo = `ATRT-${tipo}-${empresa.cnpj}.pdf`;
    writeFileSync(arquivo, pdf);
    console.log(`Gerado: ${arquivo} (assinar com o e-CPF do responsável legal e do técnico e enviar ao cliente)`);
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
