import type { CarroParaPortal } from "../olx/mapa";
import type { DealMobi } from "./cliente";

/**
 * Tradução de uma ficha do estoque para o anúncio (deal) da MobiAuto. Puro: não lê banco
 * nem rede. A MobiAuto pede tudo por ID do catálogo dela (versão/trim, cor, combustível,
 * câmbio). A km é obrigatória no portal: carro sem km informada NÃO é publicado (decisão
 * da gestão), nunca vai como "0 km" por engano.
 */

export type CatalogoMobiauto = {
  /** Marca e modelo (nomes do catálogo, só para o texto do anúncio). */
  marca?: string;
  modelo?: string;
  trim: number;
  trimNome?: string;
  cor: number;
  combustivel: number;
  cambio: number;
  opcionais?: number[];
  localidade?: number;
};

export const LIMITE_DESCRICAO = 2000;

const portasDoCarro = (c: Pick<CarroParaPortal, "portas" | "versao" | "modelo">): number | null => {
  if (c.portas && c.portas >= 2 && c.portas <= 5) return c.portas;
  const m = `${c.versao ?? ""} ${c.modelo}`.match(/\b([2-5])\s?P\b/i);
  return m ? Number(m[1]) : null;
};

export type ResultadoMobiauto = { ok: true; deal: DealMobi } | { ok: false; faltando: string[] };

export function montarDealMobiauto(c: CarroParaPortal, catalogo: CatalogoMobiauto | null, plano: string | null): ResultadoMobiauto {
  const faltando: string[] = [];
  if (c.tipo !== "CARRO") faltando.push("Por enquanto a integração com a MobiAuto publica só carros");
  if (c.kmInformado === false) faltando.push("Informar a quilometragem do carro (a MobiAuto exige a km)");
  if (!catalogo) faltando.push("Escolher marca, modelo e versão no catálogo da MobiAuto");
  else {
    if (!catalogo.cor) faltando.push("A MobiAuto não reconheceu a cor do carro: confira a cor na ficha");
    if (!catalogo.cambio) faltando.push("A MobiAuto não reconheceu o câmbio: confira na ficha");
    if (!catalogo.combustivel) faltando.push("A MobiAuto não reconheceu o combustível: confira na ficha");
  }
  if (!plano) faltando.push("Escolher o plano de publicação da MobiAuto, em Veículos → Portais");
  const preco = Math.round(c.precoCents) / 100;
  if (preco <= 0) faltando.push("Preço de anúncio");
  if (!c.fotos.length) faltando.push("Pelo menos uma foto");
  const portas = portasDoCarro(c);
  if (!portas) faltando.push("Informar o número de portas na ficha (a MobiAuto exige)");
  if (faltando.length || !catalogo) return { ok: false, faltando };

  const placa = (c.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const descricao = (c.descricao ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITE_DESCRICAO);
  return {
    ok: true,
    deal: {
      vehicleType: "CAR",
      stockKind: "USED",
      ...(catalogo.marca ? { makeName: catalogo.marca } : {}),
      ...(catalogo.modelo ? { modelName: catalogo.modelo } : {}),
      trimId: catalogo.trim,
      ...(catalogo.trimNome ? { trimName: catalogo.trimNome } : {}),
      modelYear: c.anoModelo,
      productionYear: c.anoFabricacao,
      km: Math.max(0, Math.round(c.km)),
      ...(placa.length >= 7 ? { plate: placa } : {}),
      price: preco,
      colorId: catalogo.cor,
      fuelId: catalogo.combustivel,
      transmissionId: catalogo.cambio,
      doors: portas!,
      ...(descricao ? { description: descricao } : {}),
      ...(catalogo.opcionais?.length ? { featureIds: catalogo.opcionais } : {}),
      ...(catalogo.localidade ? { localityId: catalogo.localidade } : {}),
    },
  };
}
