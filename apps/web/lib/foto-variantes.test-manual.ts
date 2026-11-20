// Versões leves das fotos. Rodar de apps/web com: npx tsx lib/foto-variantes.test-manual.ts
import assert from "node:assert/strict";
import sharp from "sharp";
import { larguraPermitida, variante } from "./foto-variantes";

async function main() {
  assert.equal(larguraPermitida(null), null);
  assert.equal(larguraPermitida("abc"), null);
  assert.equal(larguraPermitida("-5"), null);
  assert.equal(larguraPermitida("100"), 240);
  assert.equal(larguraPermitida("480"), 480);
  assert.equal(larguraPermitida("500"), 800);
  assert.equal(larguraPermitida("99999"), 1200);
  console.log("ok    larguras permitidas");

  // Uma foto "de celular": 4000x3000 com ruído (pesada de verdade), girada pelo EXIF.
  const ruido = Buffer.alloc(4000 * 3000 * 3);
  for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 7919 + (i >> 3)) & 255;
  const original = await sharp(ruido, { raw: { width: 4000, height: 3000, channels: 3 } }).jpeg({ quality: 92 }).withMetadata({ orientation: 6 }).toBuffer();
  let baixou = 0;
  const baixar = async () => (baixou++, original);

  const v1 = await variante("carro/1.jpg", 800, baixar);
  const meta = await sharp(v1).metadata();
  assert.equal(meta.format, "webp");
  // Orientação 6 gira 90°: 4000x3000 vira 3000x4000 em pé; a largura sai 800 e a altura ~1067.
  assert.equal(meta.width, 800);
  assert.ok(meta.height! > 1000 && meta.height! < 1100, `altura ${meta.height}`);
  assert.ok(v1.length < original.length / 5, `variante ${v1.length} vs original ${original.length}`);
  console.log(`ok    WebP 800px, gira pelo EXIF, ${Math.round(original.length / 1024)} KB → ${Math.round(v1.length / 1024)} KB`);

  const v2 = await variante("carro/1.jpg", 800, baixar);
  assert.equal(v2, v1);
  assert.equal(baixou, 1);
  console.log("ok    segunda vez vem do cache (sem baixar de novo)");

  const [a, b] = await Promise.all([variante("carro/2.jpg", 480, baixar), variante("carro/2.jpg", 480, baixar)]);
  assert.equal(a, b);
  assert.equal(baixou, 2);
  console.log("ok    pedidos simultâneos geram uma vez só");

  // Foto pequena não é ampliada.
  const pequena = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#888" } }).jpeg().toBuffer();
  const v3 = await variante("carro/3.jpg", 1200, async () => pequena);
  assert.equal((await sharp(v3).metadata()).width, 300);
  console.log("ok    não amplia foto pequena");

  await assert.rejects(variante("carro/4.jpg", 480, async () => Buffer.from("isto não é imagem")));
  console.log("ok    arquivo inválido dá erro (a rota cai para a original)");
  console.log("\ntudo certo");
}
main().catch((e) => { console.error(e); process.exit(1); });
