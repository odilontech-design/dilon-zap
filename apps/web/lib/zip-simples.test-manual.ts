// O zip sem compressão: confere o CRC e a estrutura lendo de volta com o leitor de xlsx (que lê zips). Puro.
// Rodar com: npx tsx --tsconfig tsconfig.json lib/zip-simples.test-manual.ts
import { crc32, montarZip } from "./zip-simples";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

checa("crc32 de '123456789' (valor padrão do CRC-32)", crc32(new TextEncoder().encode("123456789")).toString(16), "cbf43926");

const enc = new TextEncoder();
const zip = montarZip([
  { nome: "foto-1.jpg", dados: enc.encode("conteudo da foto 1") },
  { nome: "açaí-2.jpg", dados: new Uint8Array([0, 1, 2, 3, 255]) },
]);
const pasta = mkdtempSync(join(tmpdir(), "zip-"));
const arq = join(pasta, "t.zip");
writeFileSync(arq, zip);
try {
  const lista = execFileSync("python3", ["-c", "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip() or 'ok'); print(sorted(z.namelist())); print(z.read('foto-1.jpg').decode()); print(list(z.read('açaí-2.jpg')))", arq]).toString().trim().split("\n");
  checa("o Python abre o zip e o CRC confere", lista[0], "ok");
  checa("os nomes (inclusive com acento) e o conteúdo voltam iguais", [lista[1], lista[2], lista[3]], ["['açaí-2.jpg', 'foto-1.jpg']", "conteudo da foto 1", "[0, 1, 2, 3, 255]"]);
} catch (e) {
  falhas++;
  console.log("FALHA  não consegui abrir o zip:", (e as Error).message.slice(0, 200));
}
void readFileSync;

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntudo certo");
