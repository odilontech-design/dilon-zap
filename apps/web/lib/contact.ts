export type ContactRef = { id: string; name: string | null; waJid: string; avatarUrl: string | null };

export function contactLabel(contact: { name: string | null; waJid: string }) {
  return contact.name ?? contact.waJid.replace("@s.whatsapp.net", "");
}

export function formatPhone(waJid: string) {
  return waJid.replace("@s.whatsapp.net", "").replace("@lid", "");
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export type PipelineStage = "NOVO_LEAD" | "EM_CONTATO" | "PROPOSTA_ENVIADA" | "FECHADO" | "PERDIDO";

export const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: "NOVO_LEAD", label: "Novo lead" },
  { key: "EM_CONTATO", label: "Em contato" },
  { key: "PROPOSTA_ENVIADA", label: "Proposta enviada" },
  { key: "FECHADO", label: "Fechado" },
  { key: "PERDIDO", label: "Perdido" },
];
