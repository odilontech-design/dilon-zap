/**
 * Isolamento de histórico entre setores. Puro, sem banco — ver o comentário
 * de Tenant.isolarHistoricoPorSetor no schema pro porquê.
 *
 * Cada Message guarda o setor da conversa NO MOMENTO em que foi trocada
 * (Message.setorId). Filtrar é comparar essa foto com os setores de quem
 * está olhando agora — não precisa reconstruir a linha do tempo de
 * transferências toda vez que a conversa é aberta.
 *
 * O "de onde veio e por quê" não sai daqui: quem conta isso é o registro de
 * TransferenciaSetor, com o motivo que o atendente escreveu ao encaminhar.
 */

export type MensagemComSetor = { id: string; setorId: string | null };

/**
 * Separa as mensagens que quem está olhando pode ver das que ficam escondidas
 * (setor diferente do dele).
 *
 * Mensagem sem setor (setorId nulo — fila geral, antes de qualquer
 * encaminhamento) é sempre visível: não tem setor anterior pra esconder dela.
 *
 * `escondeu` existe pra tela poder avisar que falta pedaço. Sem esse aviso a
 * conversa simplesmente começaria no meio, e o atendente pensaria que o
 * cliente chegou agora.
 */
export function filtrarHistoricoPorSetor<T extends MensagemComSetor>(
  mensagens: T[],
  meusSetores: ReadonlySet<string>
): { visiveis: T[]; escondeu: boolean } {
  const visiveis: T[] = [];
  let escondeu = false;

  for (const m of mensagens) {
    if (m.setorId === null || meusSetores.has(m.setorId)) visiveis.push(m);
    else escondeu = true;
  }

  return { visiveis, escondeu };
}
