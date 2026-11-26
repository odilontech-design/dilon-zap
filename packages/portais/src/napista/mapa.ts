import type { CarroParaPortal } from "../olx/mapa";
import { normalizar } from "../texto";
import type { AtributosNapista, ItemNapista, OfertaNapista } from "./cliente";

/**
 * Tradução de uma ficha do estoque para o anúncio (offer) do NaPista. Puro: não lê banco nem
 * rede. O NaPista pede a versão por ID do catálogo e cor, combustível e câmbio por valores
 * fixos (em inglês). A km é opcional na API deles, mas a regra da gestão vale: carro sem km
 * informada NÃO é publicado, nunca vai como "0 km" por engano.
 */

const CORES: [RegExp, string][] = [
  [/branc/, "WHITE"], [/pret/, "BLACK"], [/prat/, "SILVER"], [/cinza|grafite|chumbo/, "GRAY"], [/vinho|bordo/, "BURGUNDY"], [/vermelh/, "RED"], [/azul marinho/, "NAVY"], [/azul/, "BLUE"],
  [/verde/, "GREEN"], [/amarel/, "YELLOW"], [/laranja/, "ORANGE"], [/marrom/, "BROWN"], [/bege/, "BEIGE"], [/dourad|ouro/, "GOLD"], [/bronze/, "BRONZE"], [/rosa/, "PINK"], [/roxo|violeta|lilas/, "PURPLE"], [/perol/, "PEARLED"], [/turquesa/, "TURQUOISE"],
];
const COMBUSTIVEIS: [RegExp, string][] = [[/hibrid/, "HYBRID"], [/eletric/, "ELECTRIC"], [/gnv/, "NGV"], [/flex/, "FLEX"], [/diesel/, "DIESEL"], [/etanol|alcool/, "ALCOHOL"], [/gasolina/, "GASOLINE"]];

export const corNapista = (cor: string | null | undefined): string | null => { const n = normalizar(cor ?? ""); return n ? CORES.find(([re]) => re.test(n))?.[1] ?? null : null; };
export const combustivelNapista = (c: string | null | undefined): string | null => { const n = normalizar(c ?? ""); return n ? COMBUSTIVEIS.find(([re]) => re.test(n))?.[1] ?? null : null; };
/** O NaPista só distingue manual e automático: CVT e automatizado contam como automático. */
export const cambioNapista = (c: string | null | undefined): "MANUAL" | "AUTOMATIC" | null => { const n = normalizar(c ?? ""); return !n ? null : /manual/.test(n) ? "MANUAL" : /autom|cvt/.test(n) ? "AUTOMATIC" : null; };

/** Opcionais da ficha → códigos do NaPista (só os que reconhecemos com segurança; o resto fica na descrição). */
const EQUIPAMENTOS: [RegExp, string][] = [
  [/air ?bag duplo|airbags?\b.*(duplo|dianteir)/, "CAR_2_AIRBAGDUPLO"], [/air ?bag/, "CAR_1_AIRBAG"], [/alarme/, "CAR_1_ALARME"], [/ar digital|ar condicionado digital|climatizador/, "CAR_2_ARDIGITAL"], [/ar condicionado|ar-condicionado/, "CAR_1_ARCONDICIONADO"],
  [/direcao eletrica/, "CAR_1_DIRECAOELETRICA"], [/direcao hidraulica/, "CAR_1_DIRECAOHIDRAULICA"], [/rodas? de liga/, "CAR_1_RODASDELIGALEVE"], [/travas? eletrica/, "CAR_1_TRAVAELETRICA"], [/vidros? eletrico/, "CAR_1_VIDROSELETRICOS"], [/\babs\b/, "CAR_1_FREIOSABS"],
  [/4x4|tracao 4/, "CAR_2_4x4"], [/bancos? (de|em) couro/, "CAR_2_BANCOSDECOURO"], [/bluetooth/, "CAR_2_BLUETOOTH"], [/computador de bordo/, "CAR_2_COMPUTADORDEBORDO"], [/controle de tracao/, "CAR_2_CONTROLEDETRACAO"], [/desembacador/, "CAR_2_DESEMBACADORTRASEIRO"],
  [/farol.*(neblina|milha)/, "CAR_2_FAROLNEBLINA"], [/xenon/, "CAR_2_FAROLXENONIO"], [/\bgps\b|navegador/, "CAR_2_GPS"], [/limpador traseiro/, "CAR_2_LIMPADORTRASEIRO"], [/painel digital/, "CAR_2_PAINELDIGITAL"], [/sensor de chuva/, "CAR_2_SENSORDECHUVA"],
  [/sensor de (estacionamento|re)|camera de re/, "CAR_2_SENSORDEESTACIONAMENTO"], [/teto solar/, "CAR_2_TETOSOLAR"], [/retrovisor(es)? eletrico/, "CAR_2_RETROVISORELETRICO"], [/7 lugares/, "CAR_2_7LUGARES"], [/multimidia|radio|som\b/, "CAR_2_RADIO"],
];
export function equipamentosNapista(opcionais: string[]): string[] {
  const achados = new Set<string>();
  for (const o of opcionais.flatMap((x) => x.split(/[,;]/))) {
    const n = normalizar(o);
    const m = n ? EQUIPAMENTOS.find(([re]) => re.test(n)) : null;
    if (m) achados.add(m[1]);
  }
  return [...achados];
}

export const LIMITE_DESCRICAO_NAPISTA = 2000;

const portasDoCarro = (c: Pick<CarroParaPortal, "portas" | "versao" | "modelo">): number | null => {
  if (c.portas && c.portas >= 2 && c.portas <= 5) return c.portas;
  const m = `${c.versao ?? ""} ${c.modelo}`.match(/\b([2-5])\s?P\b/i);
  return m ? Number(m[1]) : null;
};

/**
 * Confere um valor com a lista que o NaPista aceita: o nosso código (sem diferenciar maiúsculas, o NaPista
 * escreve "4X4" onde a ficha pode dar "4x4") ou o nome em português ("Vinho"). Sem lista, confia no nosso mapa.
 */
export function valorAceitoNapista(candidato: string | null, lista: ItemNapista[], textoDaFicha?: string | null): string | null {
  if (!lista.length) return candidato;
  const porId = new Map(lista.map((i) => [i.id.toUpperCase(), i.id]));
  if (candidato && porId.has(candidato.toUpperCase())) return porId.get(candidato.toUpperCase())!;
  const t = normalizar(textoDaFicha ?? "");
  return (t && lista.find((i) => normalizar(i.nome) === t)?.id) || null;
}

export type ResultadoNapista = { ok: true; oferta: OfertaNapista } | { ok: false; faltando: string[] };

export function montarOfertaNapista(c: CarroParaPortal, versionId: string | null, atributos?: AtributosNapista | null): ResultadoNapista {
  const faltando: string[] = [];
  if (c.tipo !== "CARRO") faltando.push("Por enquanto a integração com o NaPista publica só carros");
  if (c.kmInformado === false) faltando.push("Informar a quilometragem do carro (o Zap não anuncia carro sem km)");
  if (!versionId) faltando.push("Escolher marca, modelo e versão no catálogo do NaPista");
  const cor = valorAceitoNapista(corNapista(c.cor), atributos?.cores ?? [], c.cor);
  if (!cor) faltando.push("O NaPista não reconheceu a cor do carro: confira a cor na ficha");
  const cambio = valorAceitoNapista(cambioNapista(c.cambio), atributos?.cambios ?? [], c.cambio) as "MANUAL" | "AUTOMATIC" | null;
  if (!cambio) faltando.push("Informar o câmbio (manual ou automático) na ficha");
  const combustivel = valorAceitoNapista(combustivelNapista(c.combustivel), atributos?.combustiveis ?? [], c.combustivel);
  if (!combustivel) faltando.push("Informar o combustível na ficha");
  const preco = Math.round(c.precoCents / 100);
  if (preco <= 0) faltando.push("Preço de anúncio");
  if (!c.fotos.length) faltando.push("Pelo menos uma foto");
  if (faltando.length || !versionId || !cor || !cambio || !combustivel) return { ok: false, faltando };

  const placa = (c.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const descricao = (c.descricao ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITE_DESCRICAO_NAPISTA);
  const portas = portasDoCarro(c);
  // Só equipamentos que existem na lista do NaPista (o código certo, com as maiúsculas deles); o resto fica na descrição.
  const equipamentos = equipamentosNapista(c.opcionais)
    .map((e) => valorAceitoNapista(e, atributos?.equipamentos ?? []))
    .filter((e): e is string => !!e);
  return {
    ok: true,
    oferta: {
      versionId,
      modelYear: c.anoModelo,
      manufacturedYear: c.anoFabricacao,
      mileage: Math.max(0, Math.round(c.km)),
      // O NaPista recebe o preço como número inteiro (em reais, sem centavos).
      price: preco,
      ...(placa.length >= 7 ? { plate: placa } : {}),
      fuelType: combustivel,
      color: cor,
      transmissionType: cambio,
      ...(portas ? { numberOfDoors: portas } : {}),
      ...(descricao ? { description: descricao } : {}),
      ...(equipamentos.length ? { equipments: equipamentos } : {}),
    },
  };
}
