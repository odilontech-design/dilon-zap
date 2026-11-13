import sharp from "sharp";
import { downloadMedia } from "@dilon-zap/storage";

/**
 * Versões leves das fotos da vitrine (WebP redimensionado). A foto original do
 * celular tem vários MB; a vitrine só precisa de 400 a 1200 px de largura.
 * Sem isso a página fica pesada, o Google rebaixa o site (Core Web Vitals) e
 * quem está no 4G espera. As larguras são fixas (e poucas) para o cache render.
 */

export const LARGURAS_DA_FOTO = [240, 480, 800, 1200] as const;

/** A menor largura permitida que atende o pedido; lixo ou ausente → null (foto original). */
export function larguraPermitida(pedido: string | null): number | null {
  const n = Number(pedido);
  if (!pedido || !Number.isFinite(n) || n <= 0) return null;
  return LARGURAS_DA_FOTO.find((l) => l >= n) ?? LARGURAS_DA_FOTO[LARGURAS_DA_FOTO.length - 1];
}

// Cache em memória (as variantes são pequenas, 30 a 150 KB): o mesmo carro é visto muitas vezes.
const MAX_BYTES = 150 * 1024 * 1024;
const cache = new Map<string, Buffer>();
let usado = 0;
const gerando = new Map<string, Promise<Buffer>>();

function guardar(chave: string, dado: Buffer) {
  if (dado.length > MAX_BYTES / 4) return;
  cache.set(chave, dado);
  usado += dado.length;
  // Sai o mais antigo (a ordem de inserção do Map) até caber.
  for (const [k, v] of cache) {
    if (usado <= MAX_BYTES) break;
    cache.delete(k);
    usado -= v.length;
  }
}

/** Limite da imagem de origem: evita que um arquivo gigante estoure a memória do servidor. */
const MAX_PIXELS = 100_000_000;

export async function variante(chaveDaFoto: string, largura: number, baixar: (chave: string) => Promise<Buffer> = downloadMedia): Promise<Buffer> {
  const chave = `${chaveDaFoto}@${largura}`;
  const pronto = cache.get(chave);
  if (pronto) {
    // Recente de novo: vai para o fim da fila de saída.
    cache.delete(chave);
    cache.set(chave, pronto);
    return pronto;
  }
  const andando = gerando.get(chave);
  if (andando) return andando;
  const trabalho = (async () => {
    const original = await baixar(chaveDaFoto);
    const saida = await sharp(original, { limitInputPixels: MAX_PIXELS })
      .rotate() // respeita a orientação do celular (EXIF)
      .resize({ width: largura, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    guardar(chave, saida);
    return saida;
  })().finally(() => gerando.delete(chave));
  gerando.set(chave, trabalho);
  return trabalho;
}
