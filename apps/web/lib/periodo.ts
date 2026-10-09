/**
 * Períodos de filtro das telas do CRM, compartilhados pelo quadro e pelos
 * relatórios — o mesmo "este mês" tem que significar a mesma coisa nos dois.
 *
 * Roda no navegador, com o relógio de quem está olhando: para a equipe em
 * Brasília, o mês começa à meia-noite daqui, não à do servidor.
 */

export type Periodo = "todos" | "mes" | "mes-passado" | "30d" | "90d" | "custom";

export const ROTULO_PERIODO: Record<Periodo, string> = {
  todos: "Todo o período",
  mes: "Este mês",
  "mes-passado": "Mês passado",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  custom: "Personalizado…",
};

/** Período → [desde, ate] em ISO. Mês é o calendário, não "últimos 30 dias". */
export function intervaloDoPeriodo(p: Periodo, de: string, ate: string): { desde?: string; ate?: string } {
  const agora = new Date();
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (p) {
    case "mes":
      return { desde: new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString() };
    case "mes-passado":
      return {
        desde: new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString(),
        ate: new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, -1).toISOString(),
      };
    case "30d":
    case "90d": {
      const d = dia(agora);
      d.setDate(d.getDate() - (p === "30d" ? 30 : 90));
      return { desde: d.toISOString() };
    }
    case "custom": {
      const r: { desde?: string; ate?: string } = {};
      if (de) r.desde = new Date(`${de}T00:00:00`).toISOString();
      // Fim do dia escolhido: a pessoa que escolhe "até 30/09" quer incluir o dia 30.
      if (ate) r.ate = new Date(`${ate}T23:59:59.999`).toISOString();
      return r;
    }
    default:
      return {};
  }
}
