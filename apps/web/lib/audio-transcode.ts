import { spawn } from "node:child_process";

/**
 * Converte áudio (webm/opus do gravador do navegador, m4a, mp3, o que vier)
 * pra ogg/opus — o único formato que o WhatsApp aceita de verdade como nota
 * de voz.
 *
 * Por que existe: o gravador do navegador (MediaRecorder) produz um arquivo
 * webm, e mandávamos ele pro WhatsApp só rotulado como "audio/ogg" (mentira
 * no rótulo, o conteúdo continuava webm). O Baileys aceitava o envio e o
 * status ficava em SENT — mas o app do cliente nunca conseguia abrir o
 * áudio, então a mensagem "enviava" e não chegava de verdade do outro lado.
 * Foi assim que a Guttierres perdeu um áudio de teste em 23/09.
 *
 * Reencoda em vez de só re-empacotar (remux) porque nem todo áudio que passa
 * por aqui já é opus — o anexo de arquivo (📎) aceita qualquer áudio.
 * Reencodar uma vez só, sempre do mesmo jeito, é mais simples e mais
 * confiável do que decidir caso a caso.
 */
export async function transcodeParaOggOpus(
  entrada: Buffer
): Promise<{ buffer: Buffer; durationSeconds: number | null }> {
  const buffer = await executarFfmpeg(entrada);
  const durationSeconds = await medirDuracao(buffer);
  return { buffer, durationSeconds };
}

function executarFfmpeg(entrada: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn", // descarta qualquer capa/thumbnail embutido — só interessa o áudio
      "-ac",
      "1", // nota de voz é mono; e um arquivo menor sobe mais rápido numa VPS com upload limitado
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-f",
      "ogg",
      "pipe:1",
    ]);

    const saida: Buffer[] = [];
    const erro: Buffer[] = [];
    ff.stdout.on("data", (chunk) => saida.push(chunk));
    ff.stderr.on("data", (chunk) => erro.push(chunk));
    ff.on("error", reject); // ffmpeg não está instalado / não deu pra iniciar o processo
    ff.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(saida));
      else reject(new Error(`ffmpeg saiu com código ${code}: ${Buffer.concat(erro).toString("utf8").slice(0, 500)}`));
    });

    ff.stdin.write(entrada);
    ff.stdin.end();
  });
}

/**
 * Duração lida do arquivo JÁ convertido, não do original: o webm que sai do
 * MediaRecorder normalmente não escreve a duração no cabeçalho (o gravador
 * não sabe de antemão quanto tempo vai durar), então medir o original
 * costuma voltar "N/A". O ogg de saída, escrito por inteiro de uma vez, tem
 * cabeçalho confiável.
 */
function medirDuracao(oggBuffer: Buffer): Promise<number | null> {
  return new Promise((resolve) => {
    const ff = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      "pipe:0",
    ]);

    const saida: Buffer[] = [];
    ff.stdout.on("data", (chunk) => saida.push(chunk));
    // ffprobe falhando não pode derrubar o envio do áudio — a duração é só
    // pra mostrar no player, o valor null já é tratado na tela.
    ff.on("error", () => resolve(null));
    ff.on("close", () => {
      const segundos = Number(Buffer.concat(saida).toString("utf8").trim());
      resolve(Number.isFinite(segundos) && segundos > 0 ? Math.round(segundos) : null);
    });

    ff.stdin.write(oggBuffer);
    ff.stdin.end();
  });
}
