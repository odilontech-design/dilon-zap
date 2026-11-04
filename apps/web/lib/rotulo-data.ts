/** Rótulo do separador de data das conversas (Inbox e chat da equipe). */

/**
 * Como o WhatsApp escreve a data do separador: "Hoje" e "Ontem" por extenso,
 * dia da semana na semana corrente, e data cheia a partir daí.
 *
 * A referência é sempre a meia-noite de hoje, não "24h atrás" — senão às 9h
 * da manhã uma mensagem das 22h de anteontem cairia em "ontem".
 */
export function rotuloDeData(iso: string) {
  const data = new Date(iso);
  const hoje = new Date();
  const meiaNoiteHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const meiaNoiteData = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diasAtras = Math.round((meiaNoiteHoje.getTime() - meiaNoiteData.getTime()) / 86400000);

  if (diasAtras === 0) return "Hoje";
  if (diasAtras === 1) return "Ontem";

  // Passou de ontem, leva dia da semana E data completa: "Sexta-feira
  // 14/08/2026".
  //
  // Antes o dia da semana aparecia sozinho na semana corrente, e a data
  // sozinha depois disso. Os dois tinham o mesmo defeito: "Sexta-feira" não
  // diz QUAL sexta, e "14/08" obriga a pessoa a calcular que dia da semana
  // foi aquilo. Numa conversa que mistura cobrança e prazo de entrega, as
  // duas juntas respondem sem esforço.
  //
  // O ano entra sempre, inclusive no corrente: é uma palavra a mais numa
  // faixa que aparece poucas vezes por conversa, e resolve a dúvida em
  // histórico que atravessa a virada do ano.
  const diaDaSemana = data.toLocaleDateString("pt-BR", { weekday: "long" });
  const dataCompleta = data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${diaDaSemana.charAt(0).toUpperCase()}${diaDaSemana.slice(1)} ${dataCompleta}`;
}
