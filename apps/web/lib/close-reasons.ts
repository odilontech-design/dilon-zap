/**
 * Motivos de fechamento de atendimento.
 *
 * Lista fixa em vez de cadastro próprio, por enquanto: o time acabou de ser
 * treinado, e mais uma tela de configuração é mais uma coisa pra aprender
 * antes de conseguir usar. Se na prática a Believe quiser motivos próprios,
 * isso vira um CRUD como Etiquetas e Etapas — e as conversas antigas não
 * quebram, porque o que fica gravado na conversa é o texto do motivo, não
 * um id.
 *
 * A ordem importa: é a ordem em que aparecem na hora de resolver, e as duas
 * primeiras são os desfechos mais comuns.
 */
export const MOTIVOS_FECHAMENTO = [
  "Comprou",
  "Só tirou dúvida",
  "Vai pensar",
  "Achou caro",
  "Sem interesse",
  "Não respondeu",
  "Já compra de outro fornecedor",
] as const;

/** Valor especial do seletor — abre o campo de texto livre. */
export const MOTIVO_OUTRO = "__outro__";

/**
 * Cor do badge por motivo, pra bater o olho no funil e entender o desfecho
 * sem ler. Verde fechou, vermelho perdeu, âmbar em aberto, cinza neutro.
 */
export function corDoMotivo(motivo: string) {
  if (motivo === "Comprou") return "bg-emerald-100 text-emerald-900";
  if (motivo === "Sem interesse" || motivo === "Já compra de outro fornecedor") {
    return "bg-red-100 text-red-900";
  }
  if (motivo === "Vai pensar" || motivo === "Achou caro") return "bg-amber-100 text-amber-900";
  return "bg-neutral-100 text-neutral-600";
}
