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
  cor?: string | null;
  combustivel?: string | null;
  cambio?: string | null;
  opcionais?: string[];
  precoCents: number;
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

/**
 * Sem custo, sem piso, sem placa inteira (o final basta para o cliente achar
 * o carro no pátio, e a placa completa num print circula por aí).
 */
export function fichaParaCliente(v: CarroParaFicha): string {
  const linhas = [
    `*${nomeDoVeiculo(v)}*`,
    `💰 ${reais(v.precoCents)}`,
    `📍 ${v.km.toLocaleString("pt-BR")} km`,
    [v.cambio, v.combustivel, v.cor].filter(Boolean).join(" · "),
    v.opcionais?.length ? `✅ ${v.opcionais.join(", ")}` : "",
    v.placa ? `Final de placa ${v.placa.slice(-1)}` : "",
    v.descricao?.trim() ?? "",
  ];
  return linhas.filter(Boolean).join("\n");
}
