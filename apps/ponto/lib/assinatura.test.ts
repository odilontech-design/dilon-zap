import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import forge from "node-forge";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { assinarArquivoCades, lerPfx } from "./assinatura";
import { assinarPdf } from "./pdf-assinado";

/** AC de teste + certificado de titular assinado por ela, empacotados num .pfx. */
function pfxDeTeste() {
  const ac = forge.pki.rsa.generateKeyPair(2048);
  const titular = forge.pki.rsa.generateKeyPair(2048);
  const nome = (cn: string) => [{ name: "commonName", value: cn }, { name: "countryName", value: "BR" }];
  const acCert = forge.pki.createCertificate();
  acCert.publicKey = ac.publicKey;
  acCert.serialNumber = "01";
  acCert.validity.notBefore = new Date(Date.now() - 86_400_000);
  acCert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  acCert.setSubject(nome("AC Teste Dilon"));
  acCert.setIssuer(nome("AC Teste Dilon"));
  acCert.setExtensions([{ name: "basicConstraints", cA: true }, { name: "keyUsage", keyCertSign: true, cRLSign: true }]);
  acCert.sign(ac.privateKey, forge.md.sha256.create());
  const cert = forge.pki.createCertificate();
  cert.publicKey = titular.publicKey;
  cert.serialNumber = "0a1b2c";
  cert.validity.notBefore = acCert.validity.notBefore;
  cert.validity.notAfter = acCert.validity.notAfter;
  cert.setSubject(nome("DILON TECH LTDA:12345678000195"));
  cert.setIssuer(acCert.subject.attributes);
  cert.setExtensions([{ name: "keyUsage", digitalSignature: true, nonRepudiation: true }]);
  cert.sign(ac.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(titular.privateKey, [cert, acCert], "senha-teste", { algorithm: "3des" });
  return { pfx: Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary"), acPem: forge.pki.certificateToPem(acCert) };
}

const { pfx, acPem } = pfxDeTeste();
const dir = mkdtempSync(join(tmpdir(), "assinatura-"));
writeFileSync(join(dir, "ac.pem"), acPem);

test("lê o .pfx: chave, titular e cadeia", () => {
  const c = lerPfx(pfx, "senha-teste");
  assert.equal(c.titular, "DILON TECH LTDA:12345678000195");
  assert.equal(c.cadeia.length, 2);
  assert.throws(() => lerPfx(pfx, "senha-errada"));
});

test("CAdES destacado (.p7s) confere no openssl e acusa arquivo alterado", () => {
  const cert = lerPfx(pfx, "senha-teste");
  const afd = Buffer.from("000000000100000000000000\r\n", "latin1");
  writeFileSync(join(dir, "afd.txt"), afd);
  writeFileSync(join(dir, "afd.p7s"), assinarArquivoCades(afd, cert));
  const verificar = (arquivo: string) =>
    execFileSync("openssl", ["cms", "-verify", "-binary", "-inform", "DER", "-in", join(dir, "afd.p7s"), "-content", join(dir, arquivo), "-CAfile", join(dir, "ac.pem"), "-purpose", "any", "-out", "/dev/null"], { stdio: "pipe" });
  verificar("afd.txt");
  writeFileSync(join(dir, "alterado.txt"), Buffer.from("000000000100000000000001\r\n", "latin1"));
  assert.throws(() => verificar("alterado.txt"));
  // Atributos do CAdES: signing-certificate-v2 presente.
  const dump = execFileSync("openssl", ["cms", "-cmsout", "-print", "-inform", "DER", "-in", join(dir, "afd.p7s")]).toString();
  assert.match(dump, /id-smime-aa-signingCertificateV2/);
  assert.match(dump, /messageDigest/);
});

test("PAdES: PDF assinado confere no pdfsig (ETSI.CAdES.detached)", async () => {
  const cert = lerPfx(pfx, "senha-teste");
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([400, 300]);
  pagina.drawText("Comprovante de Registro de Ponto do Trabalhador", { x: 20, y: 260, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
  const assinado = await assinarPdf(doc, cert, { motivo: "Teste", local: "Duque de Caxias/RJ", contato: "teste" });
  writeFileSync(join(dir, "c.pdf"), assinado);
  const saida = execFileSync("pdfsig", [join(dir, "c.pdf")], { stdio: "pipe" }).toString();
  assert.match(saida, /Signature Validation: Signature is Valid/);
  assert.match(saida, /ETSI\.CAdES\.detached/);
  assert.match(saida, /DILON TECH LTDA/);
});
