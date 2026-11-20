import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import type { CarroPublico } from "@/lib/vitrine";

/**
 * Dados estruturados (schema.org) da vitrine: é o que o Google lê para
 * mostrar o carro com preço, quilometragem e foto no resultado da busca.
 */

const TRANSMISSAO = (c: string | null) => (!c ? undefined : /manual/i.test(c) ? "Manual" : "Automática");

export function carroParaJsonLd(c: Omit<CarroPublico, "fotos" | "entradaEm"> & { fotos?: unknown }, url: string, fotos: string[], loja?: string) {
  return {
    "@type": "Car",
    "@id": `${url}#carro`,
    name: nomeDoVeiculo(c),
    url,
    sku: c.id,
    brand: { "@type": "Brand", name: c.marca },
    model: c.modelo,
    ...(c.versao ? { vehicleConfiguration: c.versao } : {}),
    vehicleModelDate: String(c.anoModelo),
    productionDate: String(c.anoFabricacao),
    ...(c.kmInformado ? { mileageFromOdometer: { "@type": "QuantitativeValue", value: c.km, unitCode: "KMT" } } : {}),
    itemCondition: "https://schema.org/UsedCondition",
    ...(c.cor ? { color: c.cor } : {}),
    ...(c.combustivel ? { fuelType: c.combustivel } : {}),
    ...(TRANSMISSAO(c.cambio) ? { vehicleTransmission: TRANSMISSAO(c.cambio) } : {}),
    ...(c.portas ? { numberOfDoors: c.portas } : {}),
    ...(c.descricao ? { description: c.descricao } : {}),
    ...(fotos.length ? { image: fotos } : {}),
    offers: {
      "@type": "Offer",
      price: (c.precoCents / 100).toFixed(2),
      priceCurrency: "BRL",
      priceValidUntil: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      availability: c.status === "RESERVADO" ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock",
      url,
      ...(loja ? { seller: { "@type": "AutoDealer", name: loja } } : {}),
    },
  };
}

/** O bloco <script type="application/ld+json">, com "<" escapado para não fechar a tag no meio de um texto. */
export function JsonLd({ dados }: { dados: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, "\\u003c") }} />;
}
