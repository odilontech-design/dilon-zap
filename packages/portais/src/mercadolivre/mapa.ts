import type { CarroParaPortal } from "../olx/mapa";
import { normalizar, soDigitos } from "../texto";
import { CATEGORIA_CARROS_ML, type ItemMercadoLivre } from "./cliente";

/**
 * Tradução de uma ficha do estoque para o anúncio classificado do Mercado Livre (categoria
 * Carros e Caminhonetes, MLB1744). Puro: não lê banco nem rede. Os atributos vão por NOME
 * (`value_name`), como no exemplo da documentação: o Mercado Livre casa com o catálogo dele.
 * Regras da gestão que valem aqui também: carro sem km informada NÃO é publicado (nunca vai como
 * "0 km"), e preço, placa, chassi (últimos 6), foto e WhatsApp da loja são obrigatórios (a
 * documentação exige o WhatsApp do vendedor a partir de 01/10/2026 para perfil de concessionária).
 */

/** Limite de fotos pela documentação lida. Subir quando a API real confirmar mais. */
export const MAX_FOTOS_MERCADOLIVRE = 6;
export const LIMITE_TITULO_ML = 60;
export const LIMITE_DESCRICAO_ML = 5000;

export type LojaParaMercadoLivre = {
  nome: string | null;
  /** WhatsApp da loja, só dígitos, com DDD (com ou sem 55). */
  whatsapp: string | null;
  cep: string | null;
  endereco: string | null;
  email: string | null;
  site: string | null;
};

const tituloCase = (s: string) => s.trim().replace(/\s+/g, " ");

const COMBUSTIVEIS: [RegExp, string][] = [[/hibrid/, "Híbrido"], [/eletric/, "Elétrico"], [/gnv/, "GNV"], [/flex/, "Flex"], [/diesel/, "Diesel"], [/etanol|alcool/, "Álcool"], [/gasolina/, "Gasolina"]];
export const combustivelMercadoLivre = (c: string | null | undefined): string | null => { const n = normalizar(c ?? ""); return n ? COMBUSTIVEIS.find(([re]) => re.test(n))?.[1] ?? null : null; };
/** O Mercado Livre distingue manual e automático (CVT e automatizado contam como automático). */
export const cambioMercadoLivre = (c: string | null | undefined): string | null => { const n = normalizar(c ?? ""); return !n ? null : /manual/.test(n) ? "Manual" : /autom|cvt/.test(n) ? "Automática" : null; };

/** Opcionais da ficha → atributos booleanos do Mercado Livre (só os que reconhecemos com segurança). */
const OPCIONAIS: [RegExp, string][] = [
  [/air ?bag.*(passageiro|duplo)|airbags? (duplo|dianteir)/, "HAS_PASSENGER_AIRBAG"],
  [/alarme/, "HAS_ALARM"], [/ar condicionado|ar-condicionado|ar digital|climatizador/, "HAS_AIR_CONDITIONING"], [/\babs\b/, "HAS_ABS_BRAKES"], [/rodas? de liga/, "HAS_ALLOY_WHEELS"],
  [/travas? eletrica/, "HAS_POWER_DOOR_LOCKS"], [/vidros? eletrico/, "HAS_POWER_WINDOWS"], [/bancos? (de|em) couro/, "HAS_LEATHER_UPHOLSTERY"], [/teto solar|teto panoramico/, "HAS_SLIDING_ROOF"],
  [/sensor de (estacionamento|re)|camera de re/, "HAS_PARKING_SENSOR"], [/sensor de chuva/, "HAS_RAIN_SENSOR"], [/computador de bordo/, "HAS_ONBOARD_COMPUTER"], [/retrovisor(es)? eletrico/, "HAS_ELECTRIC_MIRRORS"],
  [/\busb\b|entrada usb/, "HAS_USB"], [/farol.*(neblina|milha)/, "HAS_REAR_FOGLIGHTS"],
];
export function opcionaisMercadoLivre(opcionais: string[]): string[] {
  const achados = new Set<string>();
  for (const o of opcionais.flatMap((x) => x.split(/[,;]/))) {
    const n = normalizar(o);
    const m = n ? OPCIONAIS.find(([re]) => re.test(n)) : null;
    if (m) achados.add(m[1]);
  }
  return [...achados];
}

/** Tira o que o Mercado Livre penaliza na descrição: telefone, e-mail e endereço de site (o contato vai no campo próprio). */
export function descricaoParaMercadoLivre(texto: string | null | undefined): string {
  return (texto ?? "")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "")
    .replace(/(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, LIMITE_DESCRICAO_ML);
}

export function tituloMercadoLivre(c: Pick<CarroParaPortal, "marca" | "modelo" | "versao" | "anoModelo">): string {
  const completo = tituloCase([c.marca, c.modelo, c.versao ?? "", String(c.anoModelo)].join(" "));
  if (completo.length <= LIMITE_TITULO_ML) return completo;
  // Corta a versão, que é o que menos pesa na busca; marca, modelo e ano ficam.
  const sem = tituloCase([c.marca, c.modelo, String(c.anoModelo)].join(" "));
  const resto = LIMITE_TITULO_ML - sem.length - 1;
  return resto > 4 ? tituloCase(`${c.marca} ${c.modelo} ${(c.versao ?? "").slice(0, resto).trim()} ${c.anoModelo}`).slice(0, LIMITE_TITULO_ML) : sem.slice(0, LIMITE_TITULO_ML);
}

/** DDD e número a partir de um telefone brasileiro (com ou sem 55). */
export function telefoneParaMercadoLivre(t: string | null | undefined): { ddd: string; numero: string } | null {
  let d = soDigitos(t ?? "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? { ddd: d.slice(0, 2), numero: d.slice(2) } : null;
}

export type ResultadoMercadoLivre = { ok: true; item: ItemMercadoLivre; descricao: string } | { ok: false; faltando: string[] };

export function montarItemMercadoLivre(c: CarroParaPortal, loja: LojaParaMercadoLivre): ResultadoMercadoLivre {
  const faltando: string[] = [];
  if (c.tipo !== "CARRO") faltando.push("Por enquanto a integração com o Mercado Livre publica só carros");
  if (c.kmInformado === false) faltando.push("Informar a quilometragem do carro (o Zap não anuncia carro sem km)");
  const preco = Math.round(c.precoCents / 100);
  if (preco <= 0) faltando.push("Preço de anúncio");
  if (!c.fotos.length) faltando.push("Pelo menos uma foto");
  const placa = (c.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (placa.length < 7) faltando.push("Informar a placa do carro (o Mercado Livre confere o veículo pela placa)");
  const chassi = (c.chassi ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (chassi.length < 6) faltando.push("Informar o chassi do carro (o Mercado Livre pede os 6 últimos caracteres)");
  const fone = telefoneParaMercadoLivre(loja.whatsapp);
  if (!fone) faltando.push("Informar o WhatsApp da loja com DDD em Meu site > Dados da loja (o Mercado Livre exige)");
  if (faltando.length || !fone) return { ok: false, faltando };

  const atributos: { id: string; value_name: string }[] = [];
  const attr = (id: string, valor: string | number | null | undefined) => {
    const v = valor === null || valor === undefined ? "" : String(valor).trim();
    if (v) atributos.push({ id, value_name: v });
  };
  attr("BRAND", c.marca);
  attr("MODEL", c.modelo);
  attr("TRIM", c.versao);
  attr("VEHICLE_YEAR", c.anoModelo);
  attr("KILOMETERS", `${Math.max(0, Math.round(c.km))} km`);
  attr("FUEL_TYPE", combustivelMercadoLivre(c.combustivel));
  attr("TRANSMISSION", cambioMercadoLivre(c.cambio));
  attr("COLOR", c.cor ? tituloCase(c.cor) : null);
  attr("DOORS", c.portas && c.portas >= 2 && c.portas <= 5 ? c.portas : null);
  attr("LICENSE_PLATE", placa);
  attr("VIN_LAST_DIGITS", chassi.slice(-6));
  // 0 km de verdade (km informada como zero, modelo do ano): novo. Qualquer outro caso: usado.
  attr("ITEM_CONDITION", c.kmInformado === true && c.km === 0 && c.anoModelo >= new Date().getFullYear() ? "Novo" : "Usado");
  for (const id of opcionaisMercadoLivre(c.opcionais)) attr(id, "Sim");

  const cep = soDigitos(loja.cep ?? "");
  const item: ItemMercadoLivre = {
    title: tituloMercadoLivre(c),
    category_id: CATEGORIA_CARROS_ML,
    price: preco,
    currency_id: "BRL",
    // Classificado: a documentação pede sempre quantidade 1, modo "classified" e o canal "marketplace".
    available_quantity: 1,
    buying_mode: "classified",
    listing_type_id: "silver",
    condition: atributos.find((a) => a.id === "ITEM_CONDITION")?.value_name === "Novo" ? "new" : "used",
    channels: ["marketplace"],
    pictures: c.fotos.slice(0, MAX_FOTOS_MERCADOLIVRE).map((source) => ({ source })),
    attributes: atributos,
    // O objeto vai completo (a API recusa sem country_code2 e phone2; só dígitos, sem +, espaço ou hífen).
    seller_contact: {
      contact: (loja.nome ?? "").slice(0, 60),
      country_code: "55",
      area_code: fone.ddd,
      phone: fone.numero,
      country_code2: "55",
      phone2: `${fone.ddd}${fone.numero}`,
      email: loja.email ?? "",
      webpage: loja.site ?? "",
    },
    ...(cep.length === 8 || loja.endereco ? { location: { ...(loja.endereco ? { address_line: loja.endereco.slice(0, 120) } : {}), ...(cep.length === 8 ? { zip_code: cep } : {}) } } : {}),
  };
  return { ok: true, item, descricao: descricaoParaMercadoLivre(c.descricao) };
}
