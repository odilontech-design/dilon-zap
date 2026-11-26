import { prisma } from "@dilon-zap/db";
import { dataDoSerialExcel, type AbaLida, type Celula } from "@/lib/xlsx-leitor";
import { normalizarPlaca, placaValida } from "@/lib/veiculos-regras";

/**
 * Importa a planilha de controle de vendas da loja (uma aba por mês, com a placa, o carro, o comprador, a
 * entrada, a financeira e o prazo) para o Zap: cada linha vira um carro VENDIDO, o comprador como contato (com
 * CPF, RG e endereço) e uma venda CONCLUÍDA, para os relatórios e indicadores. Em dois tempos: `simular` só
 * conta e lista o que está duvidoso; gravar cria. Idempotente: a mesma planilha enviada de novo não duplica
 * (a venda importada leva uma marca no texto e é conferida pelo carro e pela data).
 *
 * O que a planilha NÃO tem e como tratamos (tudo marcado na venda importada):
 *  - preço de venda: vira financiado + o dinheiro da entrada (aproximado; troca e boleto não entram no valor);
 *  - vendedor e origem do cliente: ficam em branco;
 *  - data de entrada do carro no estoque: usamos a data da venda (o "tempo em estoque" dos importados não vale);
 *  - linha sem data: usa o dia 1 do mês da aba (os indicadores por mês continuam certos).
 * Não mexe em financeiro (nenhuma conta a receber ou a pagar é criada) nem chama o WhatsApp.
 */

export const MARCA_IMPORTACAO = "Importada da planilha de controle";
const MAX_LINHAS = 5000;

export type LinhaDeVenda = {
  aba: string;
  linha: number;
  data: Date;
  dataExata: boolean;
  placa: string;
  modelo: string;
  versao: string | null;
  marca: string;
  anoFabricacao: number;
  anoModelo: number;
  renavam: string | null;
  chassi: string | null;
  cor: string | null;
  km: number | null;
  comprador: string;
  telefone: string;
  cpf: string | null;
  rg: string | null;
  endereco: string | null;
  financiadoCents: number;
  entradaCents: number;
  precoCents: number;
  banco: string | null;
  prazo: string | null;
  parcelaCents: number | null;
  entradaTexto: string | null;
  carroNaTroca: string | null;
};
export type ProblemaDeLinha = { aba: string; linha: number; erro: string };

const MESES: Record<string, number> = { JANEIRO: 0, FEVEREIRO: 1, MARCO: 2, ABRIL: 3, MAIO: 4, JUNHO: 5, JULHO: 6, AGOSTO: 7, SETEMBRO: 8, OUTUBRO: 9, NOV: 10, NOVEMBRO: 10, DEZ: 11, DEZEMBRO: 11 };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const txt = (c: Celula | undefined): string => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : typeof c === "number" ? (Number.isInteger(c) ? String(c) : String(c)) : c.trim());
const titulo = (s: string) => s.toLowerCase().replace(/(^|[\s/-])([a-zà-ú0-9])/g, (_, a, b) => a + b.toUpperCase());

/** "R$:68.384,80", "R$ 500" ou número → centavos. */
export function centavos(c: Celula | undefined): number | null {
  if (typeof c === "number") return Math.round(c * 100);
  const m = txt(c).match(/R\$:?\s*([\d.]+(?:,\d{1,2})?)/);
  if (!m) return null;
  return Math.round(Number(m[1].replace(/\./g, "").replace(",", ".")) * 100);
}
/** Todos os valores em reais de um texto ("R$:4.000,00 + 2 BOLETOS DE R$:500") somados, em centavos. */
export function somaDosValores(texto: string): number {
  let t = 0;
  for (const m of texto.matchAll(/R\$:?\s*([\d.]+(?:,\d{1,2})?)/g)) t += Math.round(Number(m[1].replace(/\./g, "").replace(",", ".")) * 100);
  return t;
}

/** O dinheiro da entrada: boleto (pagamento futuro) e carro na troca não entram. */
export const dinheiroDaEntrada = (texto: string): number => texto.split("+").filter((p) => !/BOLETO|TROCA/i.test(p)).reduce((t, p) => t + somaDosValores(p), 0);

const BANCOS: Record<string, string | null> = { SANTANDER: "Santander", ITAU: "Itaú", BV: "BV", BRADESCO: "Bradesco", CARBANK: "Carbank", PAN: "Pan", "FIN EXTERNO": "Financiamento externo", "CARTA DE CREDITO": "Carta de crédito", "A VISTA": null, "": null };

/** A marca pelo nome do modelo (a planilha só traz o modelo). Modelo fora da lista fica "Outra marca". */
const MARCA_DO_MODELO: Record<string, string> = {
  KA: "Ford", FIESTA: "Ford", ECOSPORT: "Ford", FOCUS: "Ford", FUSION: "Ford", RANGER: "Ford", FZ: "Yamaha",
  ONIX: "Chevrolet", PRISMA: "Chevrolet", SPIN: "Chevrolet", COBALT: "Chevrolet", CLASSIC: "Chevrolet", CORSA: "Chevrolet", CELTA: "Chevrolet", AGILE: "Chevrolet", SONIC: "Chevrolet", S10: "Chevrolet", TRACKER: "Chevrolet", MERIVA: "Chevrolet", MONTANA: "Chevrolet", CRUZE: "Chevrolet",
  SANDERO: "Renault", LOGAN: "Renault", KWID: "Renault", DUSTER: "Renault", CAPTUR: "Renault", CLIO: "Renault", FLUENCE: "Renault",
  SIENA: "Fiat", PALIO: "Fiat", UNO: "Fiat", MOBI: "Fiat", CRONOS: "Fiat", ARGO: "Fiat", PUNTO: "Fiat", IDEA: "Fiat", DOBLO: "Fiat", TORO: "Fiat", STRADA: "Fiat", FIORINO: "Fiat", PULSE: "Fiat", LINEA: "Fiat", BRAVO: "Fiat", GRAND: "Fiat",
  VIRTUS: "Volkswagen", VOYAGE: "Volkswagen", POLO: "Volkswagen", GOL: "Volkswagen", FOX: "Volkswagen", UP: "Volkswagen", SAVEIRO: "Volkswagen", SPACEFOX: "Volkswagen", JETTA: "Volkswagen", T: "Volkswagen", TIGUAN: "Volkswagen", AMAROK: "Volkswagen", NIVUS: "Volkswagen",
  HB20: "Hyundai", HB20S: "Hyundai", HB20X: "Hyundai", IX35: "Hyundai", CRETA: "Hyundai", TUCSON: "Hyundai", I30: "Hyundai",
  FIT: "Honda", CIVIC: "Honda", CITY: "Honda", WRV: "Honda", HRV: "Honda", "HR-V": "Honda", CRV: "Honda",
  ETIOS: "Toyota", COROLLA: "Toyota", YARIS: "Toyota", HILUX: "Toyota", SW4: "Toyota",
  KICKS: "Nissan", MARCH: "Nissan", VERSA: "Nissan", LIVINA: "Nissan", SENTRA: "Nissan", TIIDA: "Nissan", FRONTIER: "Nissan",
  C3: "Citroën", C4: "Citroën", AIRCROSS: "Citroën", "208": "Peugeot", "207": "Peugeot", "308": "Peugeot", "2008": "Peugeot",
  RENEGADE: "Jeep", COMPASS: "Jeep", SPORTAGE: "Kia", SORENTO: "Kia", CERATO: "Kia", PICANTO: "Kia",
};
Object.assign(MARCA_DO_MODELO, { CROSSFOX: "Volkswagen", SPACECROSS: "Volkswagen", SAVERIO: "Volkswagen", MONATANA: "Chevrolet", SOUL: "Kia", TIGGO: "Chery", L200: "Mitsubishi", OUTLANDER: "Mitsubishi", KARDIAN: "Renault", PCX: "Honda", BIZ: "Honda", "206": "Peugeot" });
/** Pelo primeiro nome do veículo; "Novo Gol" e "Nova Saveiro" valem pela palavra seguinte. */
export const marcaDoModelo = (nome: string): string => {
  const p = semAcento(nome).toUpperCase().trim().split(/\s+/);
  const palavra = /^(NOVO|NOVA)$/.test(p[0]) && p[1] ? p[1] : p[0];
  return MARCA_DO_MODELO[palavra] ?? "Outra marca";
};

/** "POLO CL ADA" → modelo "Polo", versão "Cl Ada" ("NOVO UNO" e "T CROSS" levam duas palavras no modelo). */
export function separarModelo(veiculo: string): { modelo: string; versao: string | null } {
  const p = veiculo.trim().split(/\s+/);
  const duas = /^(NOVO|NOVA|T|GRAND)$/i.test(p[0]) && p.length > 1;
  const modelo = titulo(p.slice(0, duas ? 2 : 1).join(" "));
  const resto = p.slice(duas ? 2 : 1).join(" ");
  return { modelo, versao: resto ? resto.toUpperCase() : null };
}

/** Data da célula: número do Excel, data de verdade ou texto "dd/mm/aaaa". */
export function dataDaCelula(c: Celula | undefined): Date | null {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c;
  if (typeof c === "number") return c > 20000 && c < 80000 ? dataDoSerialExcel(c) : null;
  const m = txt(c).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
}

export function telefoneDoComprador(t: Celula | undefined): string | null {
  let d = txt(t).replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 && d.startsWith("55") ? d : null;
}
const cpfFormatado = (c: Celula | undefined): string | null => {
  const d = txt(c).replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d.length ? d : null;
};

type Indice = Record<string, number>;
function achaCabecalho(linhas: Celula[][]): { ordem: number; indice: Indice } | null {
  for (let i = 0; i < Math.min(linhas.length, 6); i++) {
    const nomes = (linhas[i] ?? []).map((c) => semAcento(txt(c)).toUpperCase());
    if (nomes.includes("PLACA") && nomes.some((n) => n.includes("COMPRADOR"))) {
      const indice: Indice = {};
      nomes.forEach((n, k) => {
        const chave = n.startsWith("DATA") ? "data" : n === "PLACA" ? "placa" : n === "VEICULO" ? "veiculo" : n.startsWith("MODELO") ? "ano" : n === "RENAVAM" ? "renavam" : n === "CHASSI" ? "chassi" : n === "COR" ? "cor" : n.includes("COMPRADOR") ? "comprador" : n.startsWith("ENDERECO") ? "endereco" : n === "TELEFONE" ? "telefone" : n === "RG" ? "rg" : n === "CPF" ? "cpf" : n === "VALOR FINANCIADO" ? "financiado" : n === "ENTRADA" ? "entrada" : n === "FINANCEIRA" ? "financeira" : n === "PRAZO" ? "prazo" : n === "PARCELA" ? "parcela" : n === "KM" ? "km" : "";
        if (chave && indice[chave] === undefined) indice[chave] = k;
      });
      if (indice.data === undefined && nomes[0] === "") indice.data = 0; // aba com o título da coluna de data em branco
      return { ordem: i, indice };
    }
  }
  return null;
}

export function lerPlanilhaDeVendas(abas: AbaLida[]): { linhas: LinhaDeVenda[]; problemas: ProblemaDeLinha[]; abasLidas: string[] } {
  const linhas: LinhaDeVenda[] = [];
  const problemas: ProblemaDeLinha[] = [];
  const abasLidas: string[] = [];
  for (const aba of abas) {
    const nomeAba = semAcento(aba.nome).toUpperCase().trim();
    // Só as abas de venda de cada mês: as de transferência, IPVA, financiamento externo e repasse ficam de fora.
    if (!(nomeAba in MESES)) continue;
    const cab = achaCabecalho(aba.linhas);
    if (!cab) continue;
    abasLidas.push(aba.nome);
    const { indice: ix } = cab;
    const g = (l: Celula[], k: string) => (ix[k] === undefined ? undefined : l[ix[k]]);
    // O ano das linhas sem data: o mais comum entre as datas da própria aba.
    const anos = aba.linhas.slice(cab.ordem + 1).map((l) => (ix.data === undefined ? null : dataDaCelula(l?.[ix.data])?.getUTCFullYear() ?? null)).filter((a): a is number => !!a);
    const anoDaAba = anos.sort((a, b) => anos.filter((x) => x === b).length - anos.filter((x) => x === a).length)[0] ?? new Date().getUTCFullYear();

    for (let i = cab.ordem + 1; i < aba.linhas.length; i++) {
      const l = aba.linhas[i] ?? [];
      const placaBruta = txt(g(l, "placa"));
      if (!placaBruta) continue;
      const numero = i + 1;
      const erro = (e: string) => problemas.push({ aba: aba.nome, linha: numero, erro: e });
      const placa = normalizarPlaca(placaBruta);
      if (!placa || !placaValida(placa)) { erro(`placa inválida (${placaBruta})`); continue; }
      const comprador = txt(g(l, "comprador"));
      if (!comprador) { erro("sem nome do comprador"); continue; }
      const telefone = telefoneDoComprador(g(l, "telefone"));
      if (!telefone) { erro("sem telefone válido do comprador (DDD + número)"); continue; }
      if (linhas.length >= MAX_LINHAS) { erro(`a planilha passa de ${MAX_LINHAS} vendas`); break; }

      const bruta = g(l, "data");
      let data = dataDaCelula(bruta);
      const dataExata = !!data;
      if (!dataExata) data = new Date(Date.UTC(anoDaAba, MESES[nomeAba], 1));
      const anos2 = txt(g(l, "ano")).match(/(\d{4})\s*\/\s*(\d{4})/) ?? txt(g(l, "ano")).match(/(\d{4})/);
      const anoFabricacao = anos2 ? Number(anos2[1]) : 0;
      const anoModelo = anos2 ? Number(anos2[2] ?? anos2[1]) : 0;
      if (anoFabricacao < 1950 || anoModelo < 1950) { erro("modelo/ano inválido (use 2019/2020)"); continue; }
      const veiculo = txt(g(l, "veiculo"));
      if (!veiculo) { erro("sem o nome do veículo"); continue; }
      const { modelo, versao } = separarModelo(veiculo);

      const financeiraBruta = semAcento(txt(g(l, "financeira"))).toUpperCase().trim();
      const banco = financeiraBruta in BANCOS ? BANCOS[financeiraBruta] : titulo(txt(g(l, "financeira")));
      const entradaTexto = txt(g(l, "entrada")) || null;
      const financiadoCents = centavos(g(l, "financiado")) ?? 0;
      const entradaCents = entradaTexto ? dinheiroDaEntrada(entradaTexto) : 0;
      const kmN = Number(g(l, "km"));
      linhas.push({
        aba: aba.nome,
        linha: numero,
        data: data!,
        dataExata,
        placa,
        modelo,
        versao,
        marca: marcaDoModelo(veiculo),
        anoFabricacao,
        anoModelo,
        renavam: txt(g(l, "renavam")).replace(/\D/g, "") || null,
        chassi: txt(g(l, "chassi")).toUpperCase().replace(/\s/g, "") || null,
        cor: txt(g(l, "cor")) ? titulo(txt(g(l, "cor"))) : null,
        km: Number.isFinite(kmN) && kmN > 0 ? Math.round(kmN) : null,
        comprador: titulo(comprador),
        telefone,
        cpf: cpfFormatado(g(l, "cpf")),
        rg: txt(g(l, "rg")).replace(/\.0$/, "") || null,
        endereco: txt(g(l, "endereco")) || null,
        financiadoCents,
        entradaCents,
        precoCents: financiadoCents + entradaCents,
        banco,
        prazo: txt(g(l, "prazo")).toUpperCase() || null,
        parcelaCents: centavos(g(l, "parcela")),
        entradaTexto,
        carroNaTroca: entradaTexto?.match(/\b([A-Z]{3}\d[A-Z0-9]\d{2})\b/)?.[1] ?? null,
      });
    }
  }
  return { linhas, problemas, abasLidas };
}

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function observacaoDaVenda(l: LinhaDeVenda): string {
  return [
    `${MARCA_IMPORTACAO} (aba ${l.aba}, linha ${l.linha}).`,
    l.entradaTexto ? `Entrada: ${l.entradaTexto}.` : null,
    l.banco ? `Financiamento: ${l.banco}${l.prazo ? `, ${l.prazo}` : ""}${l.parcelaCents ? `, parcela ${reais(l.parcelaCents)}` : ""}.` : "Pagamento à vista.",
    l.carroNaTroca ? `Carro na troca (placa ${l.carroNaTroca}), valor não informado na planilha.` : null,
    "Valor de venda aproximado (financiado + dinheiro da entrada). Vendedor e origem do cliente não constam na planilha.",
    l.dataExata ? null : "Data da venda não constava na planilha: usado o dia 1 do mês da aba.",
  ].filter(Boolean).join(" ");
}

export type ResultadoImportacaoVendas = {
  abas: string[];
  linhas: number;
  comProblema: ProblemaDeLinha[];
  jaImportadas: number;
  conflitos: { aba: string; linha: number; placa: string; motivo: string }[];
  aImportar: number;
  carrosNovos: number;
  compradoresNovos: number;
  importadas: number;
  semDataExata: number;
  comTroca: number;
  falhas: ProblemaDeLinha[];
};

/** O contato do comprador sem consultar o WhatsApp (centenas de consultas de uma vez não são seguras para o número da loja). */
async function contatoDoComprador(tenantId: string, telefone: string, nome: string) {
  const jid = `${telefone}@s.whatsapp.net`;
  const porJid = await prisma.contact.findUnique({ where: { tenantId_waJid: { tenantId, waJid: jid } } });
  if (porJid) return { contact: porJid, novo: false };
  // O WhatsApp esconde alguns contatos atrás de um @lid: o telefone real fica em phoneNumber.
  const porLid = await prisma.contact.findFirst({ where: { tenantId, waJid: { endsWith: "@lid" }, phoneNumber: telefone }, orderBy: { createdAt: "asc" } });
  if (porLid) return { contact: porLid, novo: false };
  return { contact: await prisma.contact.create({ data: { tenantId, waJid: jid, name: nome, nameManual: true } }), novo: true };
}

export async function importarVendas(input: { tenantId: string; userId: string; abas: AbaLida[]; simular: boolean }): Promise<ResultadoImportacaoVendas> {
  const lida = lerPlanilhaDeVendas(input.abas);
  const r: ResultadoImportacaoVendas = { abas: lida.abasLidas, linhas: lida.linhas.length, comProblema: lida.problemas, jaImportadas: 0, conflitos: [], aImportar: 0, carrosNovos: 0, compradoresNovos: 0, importadas: 0, semDataExata: 0, comTroca: 0, falhas: [] };
  if (!lida.abasLidas.length) return r;

  // O que já existe: carros por placa e vendas já importadas (por carro e dia).
  const placas = [...new Set(lida.linhas.map((l) => l.placa))];
  const carros = await prisma.veiculo.findMany({ where: { tenantId: input.tenantId, placa: { in: placas } }, select: { id: true, placa: true, status: true } });
  const porPlaca = new Map<string, { id: string; status: string }>();
  for (const c of carros) if (c.placa && (!porPlaca.has(c.placa) || c.status === "VENDIDO")) porPlaca.set(c.placa, c);
  const importadas = carros.length
    ? await prisma.vendaVeiculo.findMany({ where: { tenantId: input.tenantId, veiculoId: { in: carros.map((c) => c.id) }, observacoes: { startsWith: MARCA_IMPORTACAO } }, select: { veiculoId: true, concluidaEm: true } })
    : [];
  const diaDe = (d: Date) => d.toISOString().slice(0, 10);
  const jaTem = new Set(importadas.map((v) => `${v.veiculoId}|${v.concluidaEm ? diaDe(v.concluidaEm) : ""}`));
  const telefonesNovos = new Set<string>();
  const existentes = new Set((await prisma.contact.findMany({ where: { tenantId: input.tenantId, waJid: { in: [...new Set(lida.linhas.map((l) => `${l.telefone}@s.whatsapp.net`))] } }, select: { waJid: true } })).map((c) => c.waJid));
  const vistosNoArquivo = new Set<string>();
  const placasNovas = new Set<string>();

  for (const l of lida.linhas) {
    const chave = `${l.placa}|${diaDe(l.data)}`;
    if (vistosNoArquivo.has(chave)) { r.conflitos.push({ aba: l.aba, linha: l.linha, placa: l.placa, motivo: "linha repetida na planilha (mesma placa e mesmo dia)" }); continue; }
    vistosNoArquivo.add(chave);
    const car = porPlaca.get(l.placa);
    if (car && (car.status === "DISPONIVEL" || car.status === "RESERVADO" || car.status === "PREPARACAO")) {
      r.conflitos.push({ aba: l.aba, linha: l.linha, placa: l.placa, motivo: "o carro ainda está no estoque do Zap: dê a saída pela venda no Zap ou corrija a placa" });
      continue;
    }
    if (car && jaTem.has(`${car.id}|${diaDe(l.data)}`)) { r.jaImportadas++; continue; }
    r.aImportar++;
    if (!l.dataExata) r.semDataExata++;
    if (l.carroNaTroca) r.comTroca++;
    if (!car && !placasNovas.has(l.placa)) { placasNovas.add(l.placa); r.carrosNovos++; }
    const jid = `${l.telefone}@s.whatsapp.net`;
    if (!existentes.has(jid) && !telefonesNovos.has(jid)) { telefonesNovos.add(jid); r.compradoresNovos++; }

    if (input.simular) continue;
    try {
      const { contact } = await contatoDoComprador(input.tenantId, l.telefone, l.comprador);
      await prisma.contact.update({
        where: { id: contact.id },
        data: { ...(contact.name ? {} : { name: l.comprador, nameManual: true }), ...(l.cpf && !contact.documento ? { documento: l.cpf } : {}), ...(l.rg && !contact.rgIe ? { rgIe: l.rg } : {}), ...(l.endereco && !contact.endereco ? { endereco: l.endereco } : {}) },
      });
      let veiculoId = car?.id;
      if (!veiculoId) {
        const novo = await prisma.veiculo.create({
          data: {
            tenantId: input.tenantId, tipo: "CARRO", placa: l.placa, renavam: l.renavam, chassi: l.chassi, marca: l.marca, modelo: l.modelo, versao: l.versao, anoFabricacao: l.anoFabricacao, anoModelo: l.anoModelo,
            cor: l.cor, km: l.km ?? 0, kmInformado: l.km !== null, precoCents: l.precoCents, status: "VENDIDO", origem: "COMPRA", naVitrine: false, entradaEm: l.data, saidaEm: l.data, statusDesde: l.data,
          },
          select: { id: true },
        });
        veiculoId = novo.id;
        porPlaca.set(l.placa, { id: novo.id, status: "VENDIDO" });
      }
      await prisma.vendaVeiculo.create({
        data: { tenantId: input.tenantId, veiculoId, contactId: contact.id, status: "CONCLUIDA", precoCents: l.precoCents, entradaCents: l.entradaCents, financiadoCents: l.financiadoCents, banco: l.banco, concluidaEm: l.data, observacoes: observacaoDaVenda(l) },
      });
      await prisma.eventoVeiculo.create({ data: { veiculoId, tipo: "venda", descricao: `Venda importada da planilha de controle (aba ${l.aba}, linha ${l.linha})`, porId: input.userId, createdAt: l.data } });
      jaTem.add(`${veiculoId}|${diaDe(l.data)}`);
      r.importadas++;
    } catch (e) {
      r.falhas.push({ aba: l.aba, linha: l.linha, erro: e instanceof Error ? e.message.slice(0, 200) : "erro ao gravar" });
    }
  }
  return r;
}
