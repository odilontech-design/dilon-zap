/**
 * Regras dos grupos do WhatsApp que não dependem de conexão nem de banco.
 *
 * Separado do session-manager pelo mesmo motivo de auto-reply-decisao.ts:
 * ter nome e teste. O session-manager só faz as idas ao WhatsApp e ao banco.
 */

export function ehGrupo(jid: string | null | undefined): jid is string {
  return !!jid && jid.endsWith("@g.us");
}

/**
 * Nome que aparece em cima de uma mensagem de grupo.
 *
 * O pushName vem primeiro: é como a pessoa se apresenta e é o que o próprio
 * WhatsApp mostra no grupo. Sem ele, o telefone — mas só quando o JID é mesmo
 * um telefone. @lid é identificador opaco, e mostrado cru pareceria um número
 * de verdade; nesse caso é melhor não ter nome do que ter um nome falso.
 */
export function nomeDoAutor(
  pushName: string | null | undefined,
  participant?: string | null,
  participantAlt?: string | null
): string | null {
  const nome = pushName?.trim();
  if (nome) return nome;

  const telefone = [participantAlt, participant].find((j) => j?.endsWith("@s.whatsapp.net"));
  if (!telefone) return null;

  // "5521999990000:12@s.whatsapp.net" — o que vem depois do ":" é o aparelho.
  const digitos = telefone.split("@")[0].split(":")[0];
  const br = digitos.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return br ? `+55 ${br[1]} ${br[2]}-${br[3]}` : `+${digitos}`;
}

/**
 * Intervalo mínimo entre dois "Atualizar lista" da tela de grupos.
 *
 * A consulta é uma só e traz todos os grupos, mas é o tipo de coisa que uma
 * pessoa clica cinco vezes seguidas quando acha que não funcionou. Consulta
 * repetida em pouco tempo é o padrão que o WhatsApp pune — foi assim que a
 * Believe perdeu a sessão em 17/08. A lista não muda de minuto em minuto.
 */
export const INTERVALO_SINCRONIZACAO_MS = 10 * 60 * 1000;

/**
 * Intervalo mínimo entre duas consultas de dados de um grupo desconhecido.
 *
 * Cobre o caso de o número reconectar e dez grupos nunca vistos mandarem
 * mensagem no mesmo minuto. O grupo que perder a vez entra sem nome e ganha
 * nome pelo evento de grupo ou pelo "Atualizar lista".
 */
export const INTERVALO_CONSULTA_GRUPO_MS = 15_000;

/** Quanto falta pra poder repetir uma consulta; 0 = pode agora. */
export function tempoRestante(ultima: number | undefined, agora: number, intervaloMs: number) {
  if (ultima === undefined) return 0;
  return Math.max(0, intervaloMs - (agora - ultima));
}

/** Um participante como o Baileys devolve em groupMetadata. */
export type ParticipanteBruto = {
  id: string;
  lid?: string | null;
  phoneNumber?: string | null;
  admin?: string | null;
};

export type ParticipanteNormalizado = {
  jid: string;
  lid: string | null;
  telefone: string | null;
  admin: boolean;
};

function digitosDoJid(jid: string | null | undefined): string | null {
  if (!jid || !jid.endsWith("@s.whatsapp.net")) return null;
  // "5521999990000:12@s.whatsapp.net" — o que vem depois do ":" é o aparelho.
  const digitos = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return digitos.length >= 8 ? digitos : null;
}

/**
 * Transforma a lista de membros que o WhatsApp devolve no formato que
 * guardamos: o par @lid ↔ telefone de cada pessoa.
 *
 * Os dois formatos de grupo aparecem na prática. Grupo em modo "lid" manda o
 * id como @lid e o número à parte, em phone_number. Grupo em modo antigo manda
 * o id já como telefone e o @lid à parte. Guardar os dois lados é o que
 * permite achar o telefone a partir do autor da mensagem — que sempre chega
 * como @lid.
 *
 * Telefone ausente é normal (comunidade com número oculto) e vira null, nunca
 * o número opaco do @lid.
 */
export function normalizarParticipantes(brutos: ParticipanteBruto[]): ParticipanteNormalizado[] {
  const vistos = new Set<string>();
  const saida: ParticipanteNormalizado[] = [];
  for (const p of brutos) {
    if (!p.id || vistos.has(p.id)) continue;
    vistos.add(p.id);
    const idEhLid = p.id.endsWith("@lid");
    saida.push({
      jid: p.id,
      lid: idEhLid ? p.id : p.lid?.endsWith("@lid") ? p.lid : null,
      telefone: idEhLid ? digitosDoJid(p.phoneNumber) : digitosDoJid(p.id),
      admin: p.admin === "admin" || p.admin === "superadmin",
    });
  }
  return saida;
}
