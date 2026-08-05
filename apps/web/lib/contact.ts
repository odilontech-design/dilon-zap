export type ContactRef = {
  id: string;
  name: string | null;
  waJid: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  lastStatusAt: string | null;
};

const STATUS_TTL_MS = 24 * 60 * 60 * 1000; // Status do WhatsApp expira em 24h

export function hasActiveStatus(contact: { lastStatusAt: string | null }) {
  return !!contact.lastStatusAt && Date.now() - new Date(contact.lastStatusAt).getTime() < STATUS_TTL_MS;
}

// Telefone real (dígitos) do contato quando dá pra saber: direto do JID se
// ele é @s.whatsapp.net, ou o phoneNumber resolvido quando é @lid (ver
// worker/session-manager.ts — @lid por si só não tem relação com o número).
function realPhoneDigits(contact: { waJid: string; phoneNumber?: string | null }): string | null {
  const digits = contact.waJid.endsWith("@s.whatsapp.net")
    ? contact.waJid.replace("@s.whatsapp.net", "")
    : contact.phoneNumber;
  // Telefone de verdade tem pelo menos 8 dígitos — abaixo disso é lixo (ex:
  // "0" de algum JID de sistema/broadcast que escapou do filtro).
  return digits && digits.length >= 8 ? digits : null;
}

// +55 21 96741-1481 (celular) ou +55 21 3333-4444 (fixo). Só chamar com
// dígitos que são de fato um telefone — nunca com o ID opaco de um @lid.
function formatBRDigits(digits: string): string {
  const match = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (match) return `+55 ${match[1]} ${match[2]}-${match[3]}`;
  return /^\d+$/.test(digits) ? `+${digits}` : digits;
}

export function contactLabel(contact: { name: string | null; waJid: string; phoneNumber?: string | null }) {
  if (contact.name) return contact.name;
  const digits = realPhoneDigits(contact);
  // Sem nome e sem telefone real conhecido (ex: @lid nunca resolvido) — o ID
  // opaco é o único identificador que sobra, mostrado cru mesmo.
  return digits ? formatBRDigits(digits) : contact.waJid.replace("@lid", "");
}

/** Dígitos crus do telefone — pra busca e pra pré-preencher o campo de edição. */
export function formatPhone(waJid: string) {
  return waJid.replace("@s.whatsapp.net", "").replace("@lid", "");
}

/** Telefone formatado pra exibição, com o mesmo fallback @lid → phoneNumber do contactLabel. */
export function formatPhoneDisplay(contact: { waJid: string; phoneNumber?: string | null }) {
  const digits = realPhoneDigits(contact);
  return digits ? formatBRDigits(digits) : "número não identificado";
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Hora se for hoje, "Ontem", dia da semana se for essa semana, senão a data — igual WhatsApp. */
export function formatListTimestamp(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (diffDays === 0) return formatTime(iso);
  if (diffDays === 1) return "Ontem";
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return formatDate(iso);
}
