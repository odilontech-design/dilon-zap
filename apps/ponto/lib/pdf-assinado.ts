import { PDFDocument } from "pdf-lib";
import signpdf from "@signpdf/signpdf";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { Signer, SUBFILTER_ETSI_CADES_DETACHED } from "@signpdf/utils";
import { assinarCms, type Certificado } from "@/lib/assinatura";

/**
 * Assina um PDF no padrão PAdES (art. 88, § 1º, da Portaria 671):
 * SubFilter ETSI.CAdES.detached e o CMS montado em lib/assinatura.ts.
 * O @signpdf só reserva o espaço da assinatura e calcula o ByteRange.
 */
class SignerIcp extends Signer {
  constructor(private readonly cert: Certificado) {
    super();
  }
  async sign(conteudo: Buffer): Promise<Buffer> {
    return assinarCms(conteudo, this.cert, { comHorario: false });
  }
}

export async function assinarPdf(
  pdfDoc: PDFDocument,
  cert: Certificado,
  info: { motivo: string; local: string; contato: string },
): Promise<Buffer> {
  pdflibAddPlaceholder({
    pdfDoc,
    reason: info.motivo,
    contactInfo: info.contato,
    name: cert.titular,
    location: info.local,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
    // A cadeia ICP-Brasil completa cabe com folga.
    signatureLength: 16384,
    appName: "Dilon Ponto",
  });
  const comEspaco = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  return signpdf.sign(comEspaco, new SignerIcp(cert));
}
