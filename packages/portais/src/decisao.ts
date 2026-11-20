import { createHash } from "node:crypto";

/**
 * O que fazer com um anúncio a cada rodada da sincronização. Puro, para
 * testar as transições sem portal nem banco.
 *
 * O carro "deve estar no ar" quando está DISPONÍVEL e a loja não desligou o
 * anúncio dele. A comparação com o último envio é por hash do anúncio
 * montado: mudou preço, km, foto ou descrição, reenvia (na OLX, "insert" com
 * o mesmo id atualiza o anúncio). Nada mudou, nada vai para o portal.
 */

export type StatusPublicacao = "FILA" | "ENVIADO" | "PUBLICADO" | "ERRO" | "REMOVENDO" | "REMOVIDO";

export type EstadoPublicacao = {
  ativo: boolean;
  status: StatusPublicacao;
  hashEnviado: string | null;
  idExterno: string | null;
  proximaTentativaEm: Date | null;
};

export type Acao =
  /** Mandar (ou atualizar) o anúncio. */
  | "enviar"
  /** Tirar do portal. */
  | "remover"
  /** Nunca chegou ao portal: só marca como removido aqui. */
  | "descartar"
  /** Um lote está em processamento no portal, ou a nova tentativa ainda não chegou. */
  | "aguardar"
  /** Deveria estar no ar, mas falta dado na ficha (o motivo vai para o erro). */
  | "bloqueado"
  | "nada";

export function hashDoAnuncio(anuncio: unknown): string {
  return createHash("sha256").update(JSON.stringify(anuncio)).digest("hex").slice(0, 32);
}

export function deveEstarNoAr(statusVeiculo: string, ativo: boolean): boolean {
  return ativo && statusVeiculo === "DISPONIVEL";
}

export function decidir(p: EstadoPublicacao, noAr: boolean, hashAtual: string | null, agora = new Date()): Acao {
  if (p.status === "ENVIADO" || p.status === "REMOVENDO") return "aguardar";
  const esperando = p.status === "ERRO" && p.proximaTentativaEm !== null && p.proximaTentativaEm > agora;

  if (noAr) {
    if (hashAtual === null) return "bloqueado";
    if (p.status === "PUBLICADO" && p.hashEnviado === hashAtual) return "nada";
    // Erro com o mesmo anúncio: espera a próxima tentativa. Ficha mudou: tenta já.
    if (esperando && p.hashEnviado === hashAtual) return "aguardar";
    return "enviar";
  }

  if (p.status === "REMOVIDO") return "nada";
  // Chegou a ser aceito no portal (tem id lá): precisa sair de lá. Envio que
  // só voltou com erro nunca virou anúncio, então não há o que apagar.
  const passouPeloPortal = p.idExterno !== null || p.status === "PUBLICADO";
  if (!passouPeloPortal) return "descartar";
  if (esperando) return "aguardar";
  return "remover";
}

/** Espera entre tentativas: 5 min, 10, 20, 40… até 6 horas. */
export function proximaTentativa(tentativas: number, agora = new Date()): Date {
  const minutos = Math.min(5 * 2 ** Math.max(0, tentativas - 1), 360);
  return new Date(agora.getTime() + minutos * 60_000);
}
