/**
 * Regras da biblioteca de materiais dos produtos. Puro, sem banco — pra ter
 * teste. A rota de upload só chama isto e grava.
 */

/** Mesmo teto do WhatsApp pra mídia: acima disso o envio falharia lá na frente. */
export const TAMANHO_MAXIMO_BYTES = 16 * 1024 * 1024;

/** Combinado com a Hemoderi (reunião 21/09): vídeo curto, pra mandar no chat. */
export const DURACAO_MAXIMA_VIDEO_S = 90;

export type TipoMidia = "IMAGE" | "DOCUMENT" | "VIDEO";

/**
 * Áudio fica de fora de propósito: a biblioteca é de termo, ficha, protocolo
 * e vídeo do serviço. Áudio gravado é conversa, não material de referência.
 */
export function classificarMaterial(mimeType: string): TipoMidia | null {
  const tipo = mimeType.split(";")[0].trim().toLowerCase();
  if (tipo.startsWith("image/")) return "IMAGE";
  if (tipo.startsWith("video/")) return "VIDEO";
  if (tipo.startsWith("audio/")) return null;
  if (tipo === "") return null;
  return "DOCUMENT";
}

/** Erro pra mostrar pro usuário, ou null quando o arquivo pode entrar. */
export function validarMaterial(m: {
  mimeType: string;
  tamanhoBytes: number;
  duracaoSegundos?: number | null;
}): string | null {
  const tipo = classificarMaterial(m.mimeType);
  if (!tipo) return "Esse tipo de arquivo não entra na biblioteca — use PDF, documento, imagem ou vídeo.";
  if (m.tamanhoBytes <= 0) return "O arquivo está vazio.";
  if (m.tamanhoBytes > TAMANHO_MAXIMO_BYTES) return "Arquivo maior que 16MB — o WhatsApp não aceitaria.";
  if (tipo === "VIDEO") {
    // Sem duração não dá pra garantir o combinado; o navegador sempre mede
    // antes de mandar, então ausência aqui é arquivo que ele não conseguiu ler.
    if (m.duracaoSegundos == null) return "Não deu pra ler a duração do vídeo — tente outro formato (MP4).";
    if (m.duracaoSegundos > DURACAO_MAXIMA_VIDEO_S) {
      return `Vídeo com ${Math.round(m.duracaoSegundos)}s — o limite combinado é ${DURACAO_MAXIMA_VIDEO_S}s.`;
    }
  }
  return null;
}
