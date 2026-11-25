/**
 * O carro como o cliente lê no WhatsApp. Mora aqui (e não no app web) porque
 * o Vendedor IA roda em outro processo e precisa mandar exatamente a mesma
 * ficha que o botão "Enviar carro" do Inbox; o web reexporta daqui.
 */

export type CarroParaFicha = {
  marca: string;
  modelo: string;
  versao?: string | null;
  anoFabricacao: number;
  anoModelo: number;
  km: number;
  /** Falso = a loja não informou a km: a ficha não diz "0 km". */
  kmInformado?: boolean;
  cor?: string | null;
  combustivel?: string | null;
  cambio?: string | null;
  opcionais?: string[];
  precoCents: number;
  /** A loja escolheu "sob consulta" para este carro: a ficha não diz o valor. */
  precoOculto?: boolean;
  /** A loja escolheu "km n/a": a ficha não diz a quilometragem. */
  kmOculto?: boolean;
  descricao?: string | null;
  placa?: string | null;
};

/** "Chevrolet Onix LT 1.0 2021/2022". */
export function nomeDoVeiculo(v: { marca: string; modelo: string; versao?: string | null; anoFabricacao: number; anoModelo: number }): string {
  const nome = [v.marca, v.modelo, v.versao].filter(Boolean).join(" ");
  return `${nome} ${v.anoFabricacao}/${v.anoModelo}`;
}

export function reais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Quantos opcionais a ficha enxuta mostra. A lista inteira passa de 40 itens e vira parede de texto no WhatsApp. */
export const MAX_OPCIONAIS_NA_FICHA = 8;

// O que o comprador procura primeiro. O resto (ar quente, desembaçador, porta-copos...) fica para a conversa ou o site.
const OPCIONAIS_DE_DESTAQUE = /ar[ -]?condicionado|dire[cç][aã]o|c[aâ]mera|multim[ií]dia|couro|teto|air ?bag|abs|sensor|carplay|android|controle de velocidade|piloto|c[aâ]mbio|turbo|4x4|tra[cç][aã]o/i;

/** Os opcionais que mais pesam na decisão primeiro, mantendo a ordem do cadastro dentro de cada grupo. */
export function destacarOpcionais(opcionais: string[], max = MAX_OPCIONAIS_NA_FICHA): string[] {
  const destaque = opcionais.filter((o) => OPCIONAIS_DE_DESTAQUE.test(o));
  const resto = opcionais.filter((o) => !OPCIONAIS_DE_DESTAQUE.test(o));
  return [...destaque, ...resto].slice(0, max);
}

export type OpcoesDaFicha = {
  /**
   * Ficha curta para o Vendedor IA: até 8 opcionais, e sem as linhas "Valor sob consulta" e "Km n/a" (quando a loja não
   * divulga, a ficha simplesmente não tem a informação). O botão "Enviar carro" do Inbox segue com a ficha completa.
   */
  enxuta?: boolean;
};

/**
 * Sem custo, sem piso, sem placa inteira (o final basta para o cliente achar
 * o carro no pátio, e a placa completa num print circula por aí).
 */
export function fichaParaCliente(v: CarroParaFicha, opcoes: OpcoesDaFicha = {}): string {
  const enxuta = opcoes.enxuta === true;
  const linhas = [
    `*${nomeDoVeiculo(v)}*`,
    v.precoOculto ? (enxuta ? "" : "💰 Valor sob consulta") : `💰 ${reais(v.precoCents)}`,
    v.kmOculto ? (enxuta ? "" : "📍 Km n/a") : v.kmInformado === false ? "" : `📍 ${v.km.toLocaleString("pt-BR")} km`,
    [v.cambio, v.combustivel, v.cor].filter(Boolean).join(" · "),
    v.opcionais?.length ? `✅ ${(enxuta ? destacarOpcionais(v.opcionais) : v.opcionais).join(", ")}` : "",
    v.placa ? `Final de placa ${v.placa.slice(-1)}` : "",
    v.descricao?.trim() ?? "",
  ];
  return linhas.filter(Boolean).join("\n");
}
