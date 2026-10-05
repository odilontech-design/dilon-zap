/**
 * BR Code do PIX — o "copia e cola" que vira QR Code no recibo.
 *
 * Puro, sem banco e sem rede, pelo mesmo motivo de recibo.ts: aqui erro não dá
 * erro. Um CRC trocado ou um campo com tamanho errado gera um código que o app
 * do banco simplesmente recusa, ou — pior — que leva o cliente a pagar um
 * valor diferente do cobrado. Isso precisa ser testável sem subir nada.
 *
 * Formato: EMV QRCPS-MPM, o mesmo que o Banco Central especifica no manual do
 * PIX. Cada campo é ID (2 dígitos) + tamanho (2 dígitos) + valor, e o último
 * campo é sempre o CRC16 sobre tudo que veio antes.
 */

/** Campo no formato ID + tamanho + valor. O tamanho tem 2 dígitos, sempre. */
function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

/**
 * CRC16/CCITT-FALSE (polinômio 0x1021, inicial 0xFFFF) — o que o padrão exige.
 * Não é o mesmo CRC16 de outros protocolos: trocar a variante gera um código
 * que parece certo e nenhum banco aceita.
 */
export function crc16(dados: string): string {
  let crc = 0xffff;
  for (let i = 0; i < dados.length; i++) {
    crc ^= dados.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Texto que o padrão aceita: sem acento, sem símbolo, e cortado no limite.
 *
 * O EMV é ASCII. "Guttierres Contábil" com acento vira bytes que deslocam a
 * contagem de tamanho do campo e quebram a leitura do código inteiro.
 */
export function sanitizar(valor: string, maximo: number): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira o acento, mantém a letra
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, maximo)
    .trim();
}

export type EntradaBrCode = {
  chave: string;
  /** Em centavos. Ausente ou zero gera código sem valor, que o pagador digita. */
  valorCents?: number;
  nomeRecebedor: string;
  cidade: string;
  /** Identificador da cobrança. "***" quando não há. */
  identificador?: string;
};

/**
 * Monta o BR Code. O retorno é o próprio "copia e cola" — é ele que vira QR.
 */
export function montarBrCode({
  chave,
  valorCents,
  nomeRecebedor,
  cidade,
  identificador,
}: EntradaBrCode): string {
  // Limites do padrão: 25 pro nome, 15 pra cidade. Passar disso é recusa certa.
  const nome = sanitizar(nomeRecebedor, 25) || "RECEBEDOR";
  const municipio = sanitizar(cidade, 15) || "BRASIL";
  const txid = sanitizar(identificador ?? "", 25) || "***";

  const contaRecebedor = campo("00", "BR.GOV.BCB.PIX") + campo("01", chave.trim());

  let payload =
    campo("00", "01") + // versão do payload
    campo("26", contaRecebedor) +
    campo("52", "0000") + // categoria do estabelecimento: não informada
    campo("53", "986"); // moeda: real

  // Valor é opcional no padrão. Com ele, o app do banco já abre com o valor
  // preenchido e o cliente não digita errado.
  if (valorCents && valorCents > 0) {
    payload += campo("54", (valorCents / 100).toFixed(2));
  }

  payload += campo("58", "BR") + campo("59", nome) + campo("60", municipio);
  payload += campo("62", campo("05", txid));

  // O CRC entra por último e cobre inclusive o próprio "6304".
  const comMarcador = `${payload}6304`;
  return `${comMarcador}${crc16(comMarcador)}`;
}
