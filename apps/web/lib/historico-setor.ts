/**
 * Isolamento de histórico entre setores. Puro, sem banco — ver o comentário
 * de Tenant.isolarHistoricoPorSetor no schema pro porquê.
 *
 * Cada Message guarda o setor da conversa NO MOMENTO em que foi trocada
 * (Message.setorId). Filtrar é comparar essa foto com os setores de quem
 * está olhando agora — não precisa reconstruir a linha do tempo de
 * transferências toda vez que a conversa é aberta.
 */

export type MensagemComSetor = { id: string; setorId: string | null };

export type MarcadorTransferencia = {
  /** Id da mensagem visível logo depois do trecho escondido. */
  antesDe: string;
  /** Setor pra que a conversa foi encaminhada — o dono do trecho que reaparece. */
  setorId: string | null;
};

/**
 * Separa as mensagens que quem está olhando pode ver das que ficam escondidas
 * (setor diferente do dele), e monta os marcadores de "conversa encaminhada"
 * nos pontos onde um trecho escondido termina.
 *
 * Mensagem sem setor (setorId nulo — fila geral, antes de qualquer
 * encaminhamento) é sempre visível: não tem setor anterior pra esconder dela.
 */
export function filtrarHistoricoPorSetor<T extends MensagemComSetor>(
  mensagens: T[],
  meusSetores: ReadonlySet<string>
): { visiveis: T[]; marcadores: MarcadorTransferencia[] } {
  const visiveis: T[] = [];
  const marcadores: MarcadorTransferencia[] = [];
  let escondendo = false;

  for (const m of mensagens) {
    const podeVer = m.setorId === null || meusSetores.has(m.setorId);
    if (podeVer) {
      // O marcador vai ANTES da primeira mensagem que reaparece depois de um
      // trecho escondido — é o ponto exato em que a conversa passou a ser
      // deste setor.
      if (escondendo) {
        marcadores.push({ antesDe: m.id, setorId: m.setorId });
        escondendo = false;
      }
      visiveis.push(m);
    } else {
      escondendo = true;
    }
  }

  return { visiveis, marcadores };
}
