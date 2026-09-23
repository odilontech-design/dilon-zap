import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Converte áudio (webm/opus do gravador do navegador, m4a, mp3, o que vier)
 * pra ogg/opus — o único formato que o WhatsApp aceita de verdade como nota
 * de voz.
 *
 * Por que existe: o gravador do navegador (MediaRecorder) produz um arquivo
 * webm, e mandávamos ele pro WhatsApp só rotulado como "audio/ogg" (mentira
 * no rótulo, o conteúdo continuava webm). O Baileys aceitava o envio e a
 * mensagem chegava com ✓✓ — mas o áudio nunca abria do outro lado. Depois de
 * corrigir o rótulo, um segundo problema apareceu: o webm do MediaRecorder
 * costuma começar com timestamp negativo (o gravador não sabe de antemão
 * quanto vai durar), e sem corrigir isso o .ogg herda uma marcação de tempo
 * que sobe e entrega certinho, mas o WhatsApp de quem recebe se recusa a
 * tocar — "este áudio não está mais disponível". Foi o que a Guttierres
 * relatou em 23/09, duas vezes seguidas.
 *
 * Reencoda em vez de só re-empacotar (remux) porque nem todo áudio que passa
 * por aqui já é opus — o anexo de arquivo (📎) aceita qualquer áudio.
 * Reencodar uma vez só, sempre do mesmo jeito, é mais simples e mais
 * confiável do que decidir caso a caso.
 *
 * A saída vai pra um arquivo temporário, não por um pipe: a duração de um
 * ogg normalmente só dá pra ler buscando o fim do arquivo, e um pipe não
 * permite busca — o ffprobe devolve "N/A" nesse caso, silenciosamente.
 */
export async function transcodeParaOggOpus(
  entrada: Buffer
): Promise<{ buffer: Buffer; durationSeconds: number | null }> {
  const dir = await mkdtemp(join(tmpdir(), "audio-"));
  const saidaPath = join(dir, `${randomUUID()}.ogg`);
  try {
    await executarFfmpeg(entrada, saidaPath);
    const [buffer, durationSeconds] = await Promise.all([readFile(saidaPath), medirDuracao(saidaPath)]);
    return { buffer, durationSeconds };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function executarFfmpeg(entrada: Buffer, saidaPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      "pipe:0",
      "-avoid_negative_ts",
      "make_zero",
      "-vn", // descarta qualquer capa/thumbnail embutido — só interessa o áudio
      "-ac",
      "1", // nota de voz é mono
      "-ar",
      "16000", // taxa de amostragem que o WhatsApp usa nas notas de voz dele mesmo
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-compression_level",
      "10",
      "-application",
      "voip", // otimizado pra fala, não pra música — é o que uma nota de voz é
      "-frame_duration",
      "60",
      saidaPath,
    ]);

    const erro: Buffer[] = [];
    ff.stderr.on("data", (chunk) => erro.push(chunk));
    ff.on("error", reject); // ffmpeg não está instalado / não deu pra iniciar o processo
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg saiu com código ${code}: ${Buffer.concat(erro).toString("utf8").slice(0, 500)}`));
    });

    ff.stdin.write(entrada);
    ff.stdin.end();
  });
}

function medirDuracao(oggPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const ff = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      oggPath,
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
  });
}
