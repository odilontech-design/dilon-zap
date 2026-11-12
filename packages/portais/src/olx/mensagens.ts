/** Os códigos de recusa da OLX, em português, dizendo o que corrigir na ficha. */
const MENSAGENS: Record<string, string> = {
  UNDEFINED_AD_ID: "Anúncio sem identificador",
  NO_IMAGE: "Anúncio sem foto (ou a OLX não conseguiu baixar as fotos)",
  NO_REGION: "CEP dos anúncios inválido",
  ERROR_FUEL_4_DEPRECATED: "Combustível não aceito pela OLX",
  ERROR_FINANCIAL_INVALID: "Situação financeira inválida",
  ERROR_CAR_FEATURE_2_INVALID: "Opcional não aceito pela OLX",
  ERROR_CAR_TYPE_1_OR_4_INVALID: "Tipo de carro não aceito pela OLX",
  ERROR_VEHICLE_TAG_INVALID: "Placa inválida",
  INVALID_PLATE: "A OLX não encontrou essa placa (confira a placa ou tente mais tarde)",
  ERROR_VEHICLE_BRAND_INVALID: "Marca do catálogo da OLX inválida: escolha de novo",
  ERROR_VEHICLE_MODEL_INVALID: "Modelo do catálogo da OLX inválido: escolha de novo",
  ERROR_VEHICLE_VERSION_INVALID: "Versão do catálogo da OLX inválida: escolha de novo",
  ERROR_VEHICLE_BRAND_MODEL_VERSION_INVALID: "Marca, modelo e versão não combinam no catálogo da OLX: escolha de novo",
};

export function traduzir(codigo: string | undefined, texto?: string): string {
  if (codigo && MENSAGENS[codigo]) return MENSAGENS[codigo];
  return [codigo, texto].filter(Boolean).join(": ") || "Recusado pela OLX";
}
