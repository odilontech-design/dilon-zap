/**
 * Gera um .zip sem compressão ("store") no navegador, para "Baixar fotos": as fotos já são JPEG ou WebP comprimidos, então
 * armazenar sem comprimir não perde nada e dispensa uma biblioteca. Formato: cabeçalhos locais + diretório central + fim.
 */

const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ArquivoZip = { nome: string; dados: Uint8Array };

export function montarZip(arquivos: ArquivoZip[], agora = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const hora = ((agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1)) & 0xffff;
  const data = ((Math.max(0, agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate()) & 0xffff;
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, data, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, a.dados.length, true);
    local.setUint32(22, a.dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, a.dados);
    const cab = new DataView(new ArrayBuffer(46));
    cab.setUint32(0, 0x02014b50, true);
    cab.setUint16(4, 20, true);
    cab.setUint16(6, 20, true);
    cab.setUint16(8, 0x0800, true);
    cab.setUint16(10, 0, true);
    cab.setUint16(12, hora, true);
    cab.setUint16(14, data, true);
    cab.setUint32(16, crc, true);
    cab.setUint32(20, a.dados.length, true);
    cab.setUint32(24, a.dados.length, true);
    cab.setUint16(28, nome.length, true);
    cab.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(cab.buffer), nome);
    deslocamento += 30 + nome.length + a.dados.length;
  }
  const tamCentral = central.reduce((t, p) => t + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, deslocamento, true);
  const todos = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todos.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of todos) {
    saida.set(p, o);
    o += p.length;
  }
  return saida;
}
