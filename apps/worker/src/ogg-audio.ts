/**
 * Duração e forma de onda de uma nota de voz Ogg/Opus, lidas do próprio
 * arquivo — sem decodificar o áudio e sem ffmpeg no worker.
 *
 * Por que existe (23/10): o Baileys calcula `seconds` e `waveform` num arquivo
 * temporário que, com a mídia passada como Buffer, já não existe quando ele
 * vai ler (ENOENT em todo envio). A nota de voz saía sem duração e sem onda:
 * o WhatsApp Web mostrava sem tempo e o celular do cliente recusava com "há
 * algo errado com o arquivo de áudio". Passando os dois prontos, o Baileys não
 * precisa daquele arquivo.
 *
 * - Duração: a posição (granule) da última página, menos o pre-skip do
 *   cabeçalho OpusHead, em amostras de 48 kHz. É exata.
 * - Onda: o Opus é de taxa variável, então pacote maior = trecho com mais som.
 *   O tamanho dos pacotes ao longo do tempo, em 64 faixas de 0 a 100, é o
 *   mesmo desenho que o WhatsApp mostra. Aproximado, e é só o desenho.
 */

const AMOSTRAS_POR_SEGUNDO = 48_000;
const BARRAS = 64;

type Pagina = { granule: bigint; pacotes: number[] };

function lerPaginas(buf: Buffer): Pagina[] {
  const paginas: Pagina[] = [];
  let pos = 0;
  let pacoteEmAberto = 0;
  while (pos + 27 <= buf.length) {
    if (buf.toString("latin1", pos, pos + 4) !== "OggS") break;
    const granule = buf.readBigInt64LE(pos + 6);
    const nSegmentos = buf[pos + 26];
    const tabela = pos + 27;
    if (tabela + nSegmentos > buf.length) break;
    const pacotes: number[] = [];
    let corpo = 0;
    for (let i = 0; i < nSegmentos; i++) {
      const tam = buf[tabela + i];
      corpo += tam;
      pacoteEmAberto += tam;
      // Segmento menor que 255 fecha o pacote; 255 continua no próximo.
      if (tam < 255) {
        pacotes.push(pacoteEmAberto);
        pacoteEmAberto = 0;
      }
    }
    paginas.push({ granule, pacotes });
    pos = tabela + nSegmentos + corpo;
  }
  return paginas;
}

export function lerNotaDeVoz(buf: Buffer): { seconds: number; waveform: Uint8Array } | null {
  if (buf.length < 64 || buf.toString("latin1", 0, 4) !== "OggS") return null;
  // OpusHead começa logo após a tabela de segmentos da primeira página.
  const cabeca = 27 + buf[26];
  if (buf.toString("latin1", cabeca, cabeca + 8) !== "OpusHead") return null;
  const preSkip = buf.readUInt16LE(cabeca + 10);

  const paginas = lerPaginas(buf);
  if (paginas.length < 3) return null;
  const ultimo = paginas[paginas.length - 1].granule;
  const segundos = Math.max(0, Number(ultimo) - preSkip) / AMOSTRAS_POR_SEGUNDO;
  if (!Number.isFinite(segundos) || segundos <= 0) return null;

  // Os dois primeiros pacotes são cabeçalhos (OpusHead, OpusTags), não som.
  const pacotes = paginas.flatMap((p) => p.pacotes).slice(2);
  const waveform = new Uint8Array(BARRAS);
  if (pacotes.length > 0) {
    const medias: number[] = [];
    for (let b = 0; b < BARRAS; b++) {
      const de = Math.floor((b * pacotes.length) / BARRAS);
      const ate = Math.max(de + 1, Math.floor(((b + 1) * pacotes.length) / BARRAS));
      const fatia = pacotes.slice(de, ate);
      medias.push(fatia.reduce((s, n) => s + n, 0) / fatia.length);
    }
    const min = Math.min(...medias);
    const max = Math.max(...medias);
    for (let b = 0; b < BARRAS; b++) {
      waveform[b] = max > min ? Math.round(((medias[b] - min) / (max - min)) * 100) : 50;
    }
  }
  // Nota de voz com menos de 1s ainda mostra "0:01", como o próprio WhatsApp.
  return { seconds: Math.max(1, Math.round(segundos)), waveform };
}
