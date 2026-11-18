/**
 * Teto de tamanho dos anexos. Puro, sem banco, para ter teste.
 *
 * Imagem, vídeo e áudio seguem o teto de mídia do WhatsApp (16MB): acima disso o
 * aplicativo recusa ou recomprime. Documento (PDF, planilha, Word) vai como
 * arquivo e o WhatsApp aceita bem mais, então o teto sobe para 50MB (pedido da
 * Believe/Sthefany, 18/11).
 */
export const LIMITE_MIDIA_BYTES = 16 * 1024 * 1024;
export const LIMITE_DOCUMENTO_BYTES = 50 * 1024 * 1024;

export type TipoDeAnexo = "AUDIO" | "IMAGE" | "DOCUMENT" | "VIDEO";

export function limiteDoAnexo(tipo: TipoDeAnexo): number {
  return tipo === "DOCUMENT" ? LIMITE_DOCUMENTO_BYTES : LIMITE_MIDIA_BYTES;
}

/** Texto para o usuário quando o arquivo passa do teto do seu tipo. */
export function mensagemDeTamanho(tipo: TipoDeAnexo): string {
  return tipo === "DOCUMENT" ? "arquivo maior que 50MB" : "arquivo maior que 16MB (documentos vão até 50MB)";
}
