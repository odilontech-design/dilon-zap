/**
 * Km que parece número padrão e não o odômetro: menos de 100 km num carro de dois anos ou mais de idade (ex.: "1 km"
 * num carro de 2015). Nenhum portal publica um carro assim: o comprador veria uma quilometragem falsa, e o estoque
 * importado de sistemas antigos trazia justamente esse valor. O aviso mais suave da tela (abaixo de 500 km) não bloqueia;
 * este bloqueia o envio ao portal até a km real ser informada. Carro zero km ou do ano não é afetado.
 */
export function kmParecePadrao(c: { km: number; anoModelo: number; kmInformado?: boolean }, anoAtual = new Date().getFullYear()): boolean {
  return c.kmInformado !== false && c.km < 100 && c.anoModelo <= anoAtual - 2;
}

export const faltaKmReal = (c: { km: number; anoModelo: number }) => `Conferir a quilometragem: ${c.km.toLocaleString("pt-BR")} km num carro ${c.anoModelo} parece número padrão (corrija a km real em Veículos > Completar)`;
