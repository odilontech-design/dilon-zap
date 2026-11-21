import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { cadeiaComHashes, marcacoesParaRep, prisma } from "@dilon-zap/ponto-db";
import { dataHoraNoFuso } from "@/lib/datas";
import { formatarCnpj, formatarCpf } from "@/lib/documentos";
import { certificadoConfigurado } from "@/lib/assinatura";
import { assinarPdf } from "@/lib/pdf-assinado";
import { dadosDoDesenvolvedor } from "@/lib/rep-arquivos";

/**
 * Comprovante de Registro de Ponto do Trabalhador (Portaria 671, art. 79):
 *   I    cabeçalho "Comprovante de Registro de Ponto do Trabalhador";
 *   II   NSR;
 *   III  empregador: nome, CNPJ/CPF e CEI/CAEPF/CNO, se existir;
 *   IV   local da prestação do serviço ou endereço do estabelecimento;
 *   V    trabalhador: nome e CPF;
 *   VI   data e horário do registro;
 *   VII  número de registro no INPI (REP-P);
 *   VIII código hash (SHA-256) da marcação.
 * Em arquivo: PDF assinado no padrão PAdES (art. 80, I, e art. 88, § 1º).
 */
export interface Comprovante {
  id: string;
  nsr: number;
  dataHora: string;
  empresa: string;
  cnpj: string;
  cnoOuCaepf: string | null;
  local: string | null;
  colaborador: string;
  cpf: string;
  registroInpi: string | null;
  hash: string;
  canal: string;
  offline: boolean;
  localizacao: boolean;
}

export const TITULO_COMPROVANTE = "Comprovante de Registro de Ponto do Trabalhador";

/** Hash oficial da marcação: o gravado, ou o recalculado para as anteriores ao REP-P. */
async function hashOficial(m: { id: string; hashRep: string | null; empresaId: string }, fuso: string): Promise<string> {
  if (m.hashRep) return m.hashRep;
  const cadeia = cadeiaComHashes(await marcacoesParaRep(prisma, m.empresaId), fuso);
  return cadeia.find((x) => x.id === m.id)?.hash ?? "";
}

export async function comprovanteDe(marcacaoId: string): Promise<Comprovante> {
  const m = await prisma.marcacao.findUniqueOrThrow({
    where: { id: marcacaoId },
    include: {
      colaborador: { select: { nome: true, cpf: true } },
      empresa: { select: { razaoSocial: true, cnpj: true, timezone: true, cnoOuCaepf: true, endereco: true } },
    },
  });
  const inpi = dadosDoDesenvolvedor().registroInpi;
  return {
    id: m.id,
    nsr: m.nsr,
    dataHora: dataHoraNoFuso(m.instante, m.empresa.timezone),
    empresa: m.empresa.razaoSocial,
    cnpj: formatarCnpj(m.empresa.cnpj),
    cnoOuCaepf: m.empresa.cnoOuCaepf,
    local: m.empresa.endereco,
    colaborador: m.colaborador.nome,
    cpf: formatarCpf(m.colaborador.cpf),
    registroInpi: inpi || null,
    hash: await hashOficial(m, m.empresa.timezone),
    canal: m.canal === "APP" ? "Aplicativo" : "Web",
    offline: m.offline,
    localizacao: m.latitude != null,
  };
}

/** PDF do comprovante, assinado (PAdES) quando o certificado está configurado. */
export async function comprovantePdf(c: Comprovante): Promise<{ pdf: Buffer; assinado: boolean }> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${TITULO_COMPROVANTE} - NSR ${c.nsr}`);
  doc.setProducer("Dilon Ponto");
  const pagina = doc.addPage([420, 330]);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 300;
  const linha = (rotulo: string, valor: string) => {
    pagina.drawText(rotulo, { x: 24, y, size: 9, font: negrito, color: rgb(0.25, 0.25, 0.25) });
    // Quebra simples para o hash e textos longos.
    const partes = valor.match(/.{1,62}/g) ?? [""];
    for (const p of partes) {
      pagina.drawText(p, { x: 150, y, size: 9, font: fonte });
      y -= 13;
    }
    y -= 3;
  };
  pagina.drawText(TITULO_COMPROVANTE, { x: 24, y, size: 13, font: negrito });
  y -= 28;
  linha("NSR", String(c.nsr).padStart(9, "0"));
  linha("Empregador", c.empresa);
  linha("CNPJ", c.cnpj);
  if (c.cnoOuCaepf) linha("CEI/CAEPF/CNO", c.cnoOuCaepf);
  if (c.local) linha("Local", c.local);
  linha("Trabalhador", c.colaborador);
  linha("CPF", c.cpf);
  linha("Data e horário", c.dataHora);
  linha("Registro no INPI", c.registroInpi ?? "");
  linha("Código hash (SHA-256)", c.hash);

  const cert = certificadoConfigurado();
  if (!cert) return { pdf: Buffer.from(await doc.save()), assinado: false };
  const pdf = await assinarPdf(doc, cert, {
    motivo: `${TITULO_COMPROVANTE} - NSR ${c.nsr}`,
    local: c.local ?? "Brasil",
    contato: dadosDoDesenvolvedor().email,
  });
  return { pdf, assinado: true };
}
