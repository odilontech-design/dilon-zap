// Biblioteca de materiais. Puro. Rodar com:
// npx tsx apps/web/lib/materiais.test-manual.ts
import { classificarMaterial, validarMaterial, TAMANHO_MAXIMO_BYTES } from "./materiais";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const ok = null;

console.log("— tipo —");
checa("PDF é documento", classificarMaterial("application/pdf"), "DOCUMENT");
checa("Word é documento", classificarMaterial("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "DOCUMENT");
checa("JPEG é imagem", classificarMaterial("image/jpeg"), "IMAGE");
checa("MP4 é vídeo", classificarMaterial("video/mp4"), "VIDEO");
checa("parâmetro no mime não atrapalha", classificarMaterial("video/mp4; codecs=avc1"), "VIDEO");
checa("áudio não entra", classificarMaterial("audio/ogg"), null);
checa("mime vazio não entra", classificarMaterial(""), null);

console.log("\n— validação —");
checa("PDF de 2MB passa", validarMaterial({ mimeType: "application/pdf", tamanhoBytes: 2_000_000 }), ok);
checa("vídeo de 60s passa", validarMaterial({ mimeType: "video/mp4", tamanhoBytes: 5_000_000, duracaoSegundos: 60 }), ok);
checa("vídeo de exatos 90s passa", validarMaterial({ mimeType: "video/mp4", tamanhoBytes: 5_000_000, duracaoSegundos: 90 }), ok);
checa(
  "vídeo de 91s é recusado com a duração na mensagem",
  validarMaterial({ mimeType: "video/mp4", tamanhoBytes: 5_000_000, duracaoSegundos: 91 }),
  "Vídeo com 91s — o limite combinado é 90s."
);
checa(
  "vídeo sem duração lida é recusado",
  validarMaterial({ mimeType: "video/mp4", tamanhoBytes: 5_000_000 }),
  "Não deu pra ler a duração do vídeo — tente outro formato (MP4)."
);
checa(
  "acima de 16MB é recusado",
  validarMaterial({ mimeType: "application/pdf", tamanhoBytes: TAMANHO_MAXIMO_BYTES + 1 }),
  "Arquivo maior que 16MB — o WhatsApp não aceitaria."
);
checa("exatos 16MB passa", validarMaterial({ mimeType: "application/pdf", tamanhoBytes: TAMANHO_MAXIMO_BYTES }), ok);
checa("arquivo vazio é recusado", validarMaterial({ mimeType: "application/pdf", tamanhoBytes: 0 }), "O arquivo está vazio.");
checa(
  "áudio é recusado",
  validarMaterial({ mimeType: "audio/mpeg", tamanhoBytes: 1000 }),
  "Esse tipo de arquivo não entra na biblioteca — use PDF, documento, imagem ou vídeo."
);
checa("imagem não exige duração", validarMaterial({ mimeType: "image/png", tamanhoBytes: 1000 }), ok);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
