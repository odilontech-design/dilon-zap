/**
 * Conversões de data das telas da ótica. Datas sem hora (consulta,
 * nascimento) viajam ao meio-dia UTC: meia-noite em UTC é 21h do dia anterior
 * em Brasília, e a data voltaria um dia para trás na tela.
 */

/** "2026-11-18" → ISO ao meio-dia UTC; vazio → null. */
export function diaParaISO(dia: string): string | null {
  return dia ? new Date(`${dia}T12:00:00Z`).toISOString() : null;
}

/** ISO (ou null) → "2026-11-18" para o <input type="date">. */
export function isoParaDia(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/** "18/11" ou "18/11 16:00", para os cartões do quadro — no relógio da loja. */
export function previsaoCurta(iso: string | null, timezone?: string): string {
  if (!iso) return "sem previsão";
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: timezone });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
  return hora === "00:00" ? dia : `${dia} ${hora}`;
}

export const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "erro ao carregar");
    return r.json();
  });

/** Lê a mensagem de erro de uma resposta das rotas (texto simples ou o formato do zod). */
export async function erroDaResposta(r: Response): Promise<string> {
  const j = await r.json().catch(() => null);
  if (!j) return "não deu para salvar — tente de novo";
  if (typeof j.error === "string") return j.error;
  const campos = j.error?.fieldErrors ? Object.entries(j.error.fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`) : [];
  const gerais = j.error?.formErrors ?? [];
  return [...gerais, ...campos].join(" · ") || "confira os campos";
}
