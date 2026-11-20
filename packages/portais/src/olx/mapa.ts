import { normalizar, soDigitos } from "../texto";

/**
 * Tradução de uma ficha do estoque para o anúncio do Autoupload da OLX
 * (categoria 2020, carros). Puro: não lê banco nem rede, para testar cada
 * regra da OLX sem conta de verdade. Referência: developers.olx.com.br
 * (api/import e api/autos/sub_auto, lidos em 12/11/2026).
 *
 * Regra que mais derruba anúncio: parâmetro opcional vai omitido, nunca vazio
 * ou zero. Por isso só entra no `params` o que a ficha realmente tem.
 */

export type CarroParaPortal = {
  id: string;
  tipo: "CARRO" | "MOTO" | "CAMINHAO";
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
  marca: string;
  modelo: string;
  versao: string | null;
  anoFabricacao: number;
  anoModelo: number;
  km: number;
  /** Falso = a loja não informou a km. Os portais exigem a km: o carro não vai como "0 km". */
  kmInformado?: boolean;
  cor: string | null;
  combustivel: string | null;
  cambio: string | null;
  portas: number | null;
  opcionais: string[];
  precoCents: number;
  descricao: string | null;
  /** Endereços públicos das fotos, na ordem (a primeira é a capa). */
  fotos: string[];
};

/** Ids do catálogo da OLX escolhidos para o carro (texto, como a OLX pede). */
export type CatalogoOlx = { marca: string; modelo: string; versao: string };

export type LojaParaPortal = { cep: string | null; telefone: string | null };

export type AnuncioOlx = {
  id: string;
  operation: "insert";
  category: number;
  body: string;
  phone: number;
  type: "s";
  price: number;
  zipcode: string;
  params: Record<string, string | number | string[]>;
  images: string[];
};

export const CATEGORIA_CARROS = 2020;
export const MAX_FOTOS_OLX = 20;

/** O id que a OLX aceita: até 19 caracteres de [A-Za-z0-9_{}-]. O cuid tem 25. */
export function idParaOlx(veiculoId: string): string {
  return veiculoId.replace(/[^A-Za-z0-9_{}-]/g, "").slice(-19);
}

function combustivel(v: string | null): number | undefined {
  const n = normalizar(v ?? "");
  if (!n) return undefined;
  if (n.includes("hibrid")) return 6;
  if (n.includes("eletric")) return 7;
  if (n.includes("flex")) return 3;
  if (n.includes("diesel")) return 5;
  if (n.includes("etanol") || n.includes("alcool")) return 2;
  if (n.includes("gasolina")) return 1;
  return undefined; // GNV e afins: a OLX não tem código (o 4 foi descontinuado)
}

function cambio(v: string | null): number | undefined {
  const n = normalizar(v ?? "");
  if (!n) return undefined;
  if (n.includes("semi")) return 3;
  if (n.includes("automatizad")) return 4;
  if (n.includes("manual")) return 1;
  if (n.includes("autom") || n.includes("cvt")) return 2;
  return undefined;
}

function portas(n: number | null): number | undefined {
  if (n === 2) return 1;
  if (n === 4 || n === 5) return 2;
  if (n === 3) return 3;
  return undefined;
}

function cor(v: string | null): number | undefined {
  const n = normalizar(v ?? "");
  if (!n) return undefined;
  const tabela: [string, number][] = [
    ["preto", 1], ["preta", 1], ["branc", 2], ["prata", 3], ["vermelh", 4], ["vinho", 4],
    ["cinza", 5], ["grafite", 5], ["azul", 6], ["amarel", 7], ["verde", 8], ["laranja", 9],
  ];
  for (const [chave, codigo] of tabela) if (n.includes(chave)) return codigo;
  return 10; // "outra"
}

/** Potência pela versão ("1.0 TSI" → 1; "2.0" → 10). Sem número na versão, fica de fora. */
export function potencia(versao: string | null, modelo = ""): number | undefined {
  const m = `${modelo} ${versao ?? ""}`.match(/(?:^|[^\d.])(\d)[.,](\d)(?!\d)/);
  if (!m) return undefined;
  const litros = Number(`${m[1]}.${m[2]}`);
  if (litros < 1) return undefined;
  if (litros >= 4) return 12;
  if (litros >= 3) return 11;
  if (litros >= 2) return 10;
  const codigos: Record<string, number> = { "1": 1, "1.2": 2, "1.3": 3, "1.4": 4, "1.5": 5, "1.6": 6, "1.7": 7, "1.8": 8, "1.9": 9 };
  return codigos[String(litros)] ?? (litros < 1.2 ? 1 : undefined);
}

/** Opcionais em texto livre → códigos de car_features da OLX (o 2 não existe mais). */
export function opcionaisOlx(opcionais: string[]): string[] {
  const regras: [RegExp, string][] = [
    [/\bar\b|ar condicionado|ar cond|climatiz/, "1"],
    [/vidro.*eletric|vidros eletric/, "3"],
    [/trava/, "4"],
    [/airbag|air bag/, "5"],
    [/alarme/, "6"],
    [/\bsom\b|multimidia|radio|central multimidia/, "7"],
    [/sensor.*(re|estacionamento)/, "8"],
    [/camera.*re|camera de re/, "9"],
    [/blindad/, "10"],
    [/couro/, "11"],
    [/computador de bordo/, "12"],
    [/\busb\b/, "13"],
    [/volante multi/, "14"],
    [/bluetooth/, "15"],
    [/\bgps\b|navegador/, "16"],
    [/piloto automatico|controle de cruzeiro/, "17"],
    [/roda.*liga|rodas de liga/, "18"],
    [/teto solar|teto panoramico/, "19"],
    [/4x4|tracao integral/, "20"],
  ];
  const achados = new Set<string>();
  for (const item of opcionais.flatMap((o) => o.split(/[,;]/))) {
    const n = normalizar(item);
    if (!n) continue;
    for (const [re, codigo] of regras) if (re.test(n)) achados.add(codigo);
  }
  return [...achados].sort((a, b) => Number(a) - Number(b));
}

/** Antes de 1980 a OLX agrupa por década. */
function anoOlx(ano: number): string {
  if (ano >= 1980) return String(ano);
  if (ano <= 1950) return "1950";
  return String(Math.floor(ano / 5) * 5); // faixas de 5 anos: 1977 → "1975"
}

function corpoDoAnuncio(c: CarroParaPortal): string {
  const linhas = [
    c.descricao?.trim(),
    c.opcionais.length ? `Opcionais: ${c.opcionais.join(", ")}.` : null,
  ].filter(Boolean) as string[];
  let corpo = linhas.join("\n\n");
  if (corpo.length < 2) corpo = `${c.marca} ${c.modelo} ${c.versao ?? ""} ${c.anoFabricacao}/${c.anoModelo}, ${c.km.toLocaleString("pt-BR")} km.`.replace(/\s+/g, " ").trim();
  return corpo.slice(0, 6000);
}

export type ResultadoMapa = { ok: true; anuncio: AnuncioOlx } | { ok: false; faltando: string[] };

export function montarAnuncioOlx(c: CarroParaPortal, catalogo: CatalogoOlx | null, loja: LojaParaPortal): ResultadoMapa {
  const faltando: string[] = [];
  if (c.tipo !== "CARRO") faltando.push("Por enquanto a integração com a OLX publica só carros");
  if (!catalogo?.marca || !catalogo.modelo || !catalogo.versao) faltando.push("Escolher marca, modelo e versão no catálogo da OLX");
  const fotos = [...new Set(c.fotos)].slice(0, MAX_FOTOS_OLX);
  if (!fotos.length) faltando.push("Pelo menos uma foto");
  if (c.kmInformado === false) faltando.push("Informar a quilometragem do carro (a OLX exige a km)");
  const preco = Math.round(c.precoCents / 100);
  if (preco <= 0) faltando.push("Preço de anúncio");
  const cep = soDigitos(loja.cep);
  if (cep.length !== 8) faltando.push("CEP dos anúncios (em Veículos → Portais)");
  let telefone = soDigitos(loja.telefone);
  if (telefone.length >= 12 && telefone.startsWith("55")) telefone = telefone.slice(2);
  if (telefone.length < 10 || telefone.length > 11) faltando.push("Telefone dos anúncios com DDD (em Veículos → Portais)");
  const placa = (c.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!placa) faltando.push("Placa (a OLX exige em carro usado)");
  if (faltando.length) return { ok: false, faltando };

  const params: AnuncioOlx["params"] = {
    regdate: anoOlx(c.anoModelo),
    mileage: Math.max(0, Math.round(c.km)),
    vehicle_brand: catalogo!.marca,
    vehicle_model: catalogo!.modelo,
    vehicle_version: catalogo!.versao,
    vehicle_tag: placa,
  };
  const opcionais: [string, number | undefined][] = [
    ["fuel", combustivel(c.combustivel)],
    ["gearbox", cambio(c.cambio)],
    ["doors", portas(c.portas)],
    ["carcolor", cor(c.cor)],
    ["motorpower", potencia(c.versao, c.modelo)],
  ];
  for (const [chave, valor] of opcionais) if (valor !== undefined) params[chave] = String(valor);
  const features = opcionaisOlx(c.opcionais);
  if (features.length) params.car_features = features;
  const chassi = (c.chassi ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (chassi.length === 17) params.chassi = chassi;
  const renavam = soDigitos(c.renavam);
  if (renavam.length >= 9) params.renavam = renavam;

  return {
    ok: true,
    anuncio: {
      id: idParaOlx(c.id),
      operation: "insert",
      category: CATEGORIA_CARROS,
      body: corpoDoAnuncio(c),
      phone: Number(telefone),
      type: "s",
      price: preco,
      zipcode: cep,
      params,
      images: fotos,
    },
  };
}
