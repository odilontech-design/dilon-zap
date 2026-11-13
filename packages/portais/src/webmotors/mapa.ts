import type { CarroParaPortal } from "../olx/mapa";
import type { AnuncioWM } from "./cliente";

/**
 * Tradução de uma ficha do estoque para o anúncio da Webmotors (serviço
 * wsEstoqueRevendedorWebMotors, tipo `Anuncio`). Puro: não lê banco nem rede.
 *
 * A Webmotors pede tudo por CÓDIGO do catálogo dela (marca, modelo, versão, cor,
 * câmbio, combustível), e a km é obrigatória. Carro sem km informada NÃO é publicado
 * (decisão da gestão): nunca vai como "0 km" por engano.
 */

/** Os códigos do catálogo da Webmotors escolhidos para o carro. */
export type CatalogoWebmotors = {
  marca: string;
  modelo: string;
  versao: string;
  cor: string;
  cambio: string;
  combustivel: string;
  /** Códigos dos opcionais que a Webmotors reconheceu (os demais ficam só no texto). */
  opcionais?: number[];
};

export const LIMITE_OBSERVACAO = 1000;

/** Número de portas: o da ficha, ou o "4P" que vem no nome da versão ("1.0 MPFI LS 8V FLEX 4P MANUAL"). */
export function portasDoCarro(c: Pick<CarroParaPortal, "portas" | "versao" | "modelo">): number | null {
  if (c.portas && c.portas >= 2 && c.portas <= 5) return c.portas;
  const m = `${c.versao ?? ""} ${c.modelo}`.match(/\b([2-5])\s?P\b/i);
  return m ? Number(m[1]) : null;
}

export type ResultadoWebmotors = { ok: true; anuncio: AnuncioWM } | { ok: false; faltando: string[] };

export function montarAnuncioWebmotors(
  c: CarroParaPortal,
  catalogo: CatalogoWebmotors | null,
  modalidade: string | null,
  /** Código do anúncio na Webmotors (0 = ainda não existe lá). */
  codigoAnuncio = 0,
): ResultadoWebmotors {
  const faltando: string[] = [];
  if (c.tipo !== "CARRO") faltando.push("Por enquanto a integração com a Webmotors publica só carros");
  if (c.kmInformado === false) faltando.push("Informar a quilometragem do carro (a Webmotors exige a km)");
  if (!catalogo) faltando.push("Escolher marca, modelo e versão no catálogo da Webmotors");
  else {
    if (!catalogo.cor) faltando.push("A Webmotors não reconheceu a cor do carro: confira a cor na ficha");
    if (!catalogo.cambio) faltando.push("A Webmotors não reconheceu o câmbio: confira na ficha");
    if (!catalogo.combustivel) faltando.push("A Webmotors não reconheceu o combustível: confira na ficha");
  }
  if (!modalidade) faltando.push("Escolher a modalidade (plano do anúncio) na Webmotors, em Veículos → Portais");
  const preco = Math.round(c.precoCents) / 100;
  if (preco <= 0) faltando.push("Preço de anúncio");
  if (!c.fotos.length) faltando.push("Pelo menos uma foto");
  const portas = portasDoCarro(c);
  if (!portas) faltando.push("Informar o número de portas na ficha (a Webmotors exige)");
  if (faltando.length || !catalogo) return { ok: false, faltando };

  const placa = (c.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const observacao = (c.descricao ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITE_OBSERVACAO);
  return {
    ok: true,
    anuncio: {
      CodigoAnuncio: codigoAnuncio,
      CodigoModalidade: Number(modalidade),
      TipoAnuncio: "U",
      CodigoMarca: Number(catalogo.marca),
      CodigoModelo: Number(catalogo.modelo),
      CodigoVersao: Number(catalogo.versao),
      AnoDoModelo: c.anoModelo,
      AnoFabricacao: c.anoFabricacao,
      Km: Math.max(0, Math.round(c.km)),
      ...(placa.length >= 7 ? { Placa: placa } : {}),
      CodigoCambio: catalogo.cambio,
      NrPortas: portas!,
      CodigoCor: catalogo.cor,
      CodigoCombustivel: catalogo.combustivel,
      PrecoReal: preco,
      PrecoVenda: preco,
      ...(observacao ? { Observacao: observacao } : {}),
      ...(catalogo.opcionais?.length ? { Opcionais: catalogo.opcionais } : {}),
    },
  };
}
