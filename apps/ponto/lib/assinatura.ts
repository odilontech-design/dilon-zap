import { createHash } from "node:crypto";
import forge from "node-forge";

/**
 * Assinatura eletrônica qualificada (ICP-Brasil) dos arquivos do REP-P.
 *
 * Portaria MTP 671/2021:
 *   - art. 86, § 1º: o AFD e o Comprovante de Registro de Ponto levam a
 *     assinatura do DESENVOLVEDOR (a Dilon Tech); § 2º: o AEJ, do
 *     desenvolvedor ou do empregador (aqui, do desenvolvedor);
 *   - art. 88: certificado digital válido emitido por AC da ICP-Brasil;
 *     § 1º comprovante em PDF no padrão PAdES; § 2º AFD e AEJ no padrão
 *     CAdES, em arquivo .p7s destacado (detached).
 *
 * O certificado é o e-CNPJ A1 (.pfx) da Dilon Tech, nas variáveis
 * PONTO_CERT_PFX_BASE64 (o arquivo .pfx em base64) e PONTO_CERT_SENHA.
 *
 * A estrutura CMS é montada aqui, campo a campo, porque o CAdES exige o
 * atributo signing-certificate-v2 (RFC 5035), que o node-forge não gera.
 * Atributos assinados: content-type, message-digest (SHA-256),
 * signing-certificate-v2 e, fora do PDF, signing-time (no PAdES o horário vai
 * no dicionário da assinatura, e o atributo signing-time não deve ser usado).
 *
 * Política de assinatura ICP-Brasil (AD-RB, DOC-ICP-15): não é incluída. A
 * Portaria pede CAdES/PAdES com certificado ICP-Brasil e não nomeia política;
 * se o verificador do ITI ou a fiscalização exigirem, entra o atributo
 * signature-policy-identifier aqui.
 */

const { asn1, pki } = forge;
const OID = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingTime: "1.2.840.113549.1.9.5",
  signingCertificateV2: "1.2.840.113549.1.9.16.2.47",
  sha256: "2.16.840.1.101.3.4.2.1",
  sha256WithRSA: "1.2.840.113549.1.1.11",
};

export interface Certificado {
  chave: forge.pki.rsa.PrivateKey;
  certificado: forge.pki.Certificate;
  /** Certificado do titular primeiro, depois a cadeia (se o .pfx trouxer). */
  cadeia: forge.pki.Certificate[];
  titular: string;
  validoAte: Date;
}

let emCache: Certificado | null | undefined;

/** Lê o .pfx das variáveis de ambiente. null = não configurado. */
export function certificadoConfigurado(): Certificado | null {
  if (emCache !== undefined) return emCache;
  const base64 = process.env.PONTO_CERT_PFX_BASE64;
  if (!base64) return (emCache = null);
  emCache = lerPfx(Buffer.from(base64, "base64"), process.env.PONTO_CERT_SENHA ?? "");
  return emCache;
}

export function lerPfx(pfx: Buffer, senha: string): Certificado {
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1.fromDer(forge.util.createBuffer(pfx.toString("binary"))), senha);
  const chaves = [
    ...(p12.getBags({ bagType: pki.oids.pkcs8ShroudedKeyBag })[pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: pki.oids.keyBag })[pki.oids.keyBag] ?? []),
  ];
  const certs = (p12.getBags({ bagType: pki.oids.certBag })[pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));
  const chave = chaves[0]?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!chave) throw new Error("O .pfx não tem chave privada (ou a senha está errada).");
  // O certificado do titular é o que tem a mesma chave pública.
  const titular = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(chave.n));
  if (!titular) throw new Error("O .pfx não tem o certificado da chave privada.");
  return {
    chave,
    certificado: titular,
    cadeia: [titular, ...certs.filter((c) => c !== titular)],
    titular: String(titular.subject.getField("CN")?.value ?? ""),
    validoAte: titular.validity.notAfter,
  };
}

const der = (o: forge.asn1.Asn1) => Buffer.from(asn1.toDer(o).getBytes(), "binary");
const oid = (v: string) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(v).getBytes());
const seq = (v: forge.asn1.Asn1[]) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, v);
const set = (v: forge.asn1.Asn1[]) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, v);
const octet = (b: Buffer) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, b.toString("binary"));
const int = (n: number) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(n).getBytes());
const atributo = (tipo: string, valor: forge.asn1.Asn1) => seq([oid(tipo), set([valor])]);
const algoritmo = (v: string) => seq([oid(v), asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, "")]);

/**
 * Monta um CMS SignedData destacado (CAdES-BES) sobre `conteudo`.
 * Devolve o DER, que é o conteúdo do arquivo .p7s.
 */
export function assinarCms(conteudo: Buffer, cert: Certificado, opcoes: { comHorario: boolean; horario?: Date }): Buffer {
  const certDer = der(pki.certificateToAsn1(cert.certificado));
  const atributos: forge.asn1.Asn1[] = [
    atributo(OID.contentType, oid(OID.data)),
    ...(opcoes.comHorario
      ? [atributo(OID.signingTime, asn1.create(asn1.Class.UNIVERSAL, asn1.Type.UTCTIME, false, asn1.dateToUtcTime(opcoes.horario ?? new Date())))]
      : []),
    atributo(OID.messageDigest, octet(createHash("sha256").update(conteudo).digest())),
    // ESSCertIDv2 com o algoritmo padrão (SHA-256), por isso sem hashAlgorithm.
    atributo(OID.signingCertificateV2, seq([seq([seq([octet(createHash("sha256").update(certDer).digest())])])])),
  ];

  // Assina o DER do SET dos atributos (com a tag de SET, não a [0]).
  const md = forge.md.sha256.create();
  md.update(asn1.toDer(set(atributos)).getBytes());
  const assinatura = Buffer.from(cert.chave.sign(md), "binary");

  const issuerAndSerial = seq([
    pki.distinguishedNameToAsn1(cert.certificado.issuer),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, forge.util.hexToBytes(cert.certificado.serialNumber)),
  ]);
  const signerInfo = seq([
    int(1),
    issuerAndSerial,
    algoritmo(OID.sha256),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, atributos),
    algoritmo(OID.sha256WithRSA),
    octet(assinatura),
  ]);
  const signedData = seq([
    int(1),
    set([algoritmo(OID.sha256)]),
    seq([oid(OID.data)]), // destacado: sem eContent
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, cert.cadeia.map((c) => pki.certificateToAsn1(c))),
    set([signerInfo]),
  ]);
  return der(seq([oid(OID.signedData), asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData])]));
}

/** Arquivo .p7s CAdES destacado para o AFD ou o AEJ. */
export function assinarArquivoCades(conteudo: Buffer, cert: Certificado): Buffer {
  return assinarCms(conteudo, cert, { comHorario: true });
}
