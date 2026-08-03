export function centsToBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Próxima ocorrência do dia de vencimento a partir de hoje (mês atual se ainda não passou, senão o seguinte). */
export function nextDueDate(cycleDay: number, from = new Date()) {
  const candidate = new Date(from.getFullYear(), from.getMonth(), cycleDay);
  if (candidate < from) candidate.setMonth(candidate.getMonth() + 1);
  return candidate;
}

/** PENDING com vencimento no passado é exibido como OVERDUE sem precisar de cron reescrevendo o banco. */
export function effectiveInvoiceStatus(invoice: { status: string; dueDate: Date | string }) {
  if (invoice.status !== "PENDING") return invoice.status;
  return new Date(invoice.dueDate) < new Date() ? "OVERDUE" : "PENDING";
}
