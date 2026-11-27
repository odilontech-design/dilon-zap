import { centsToBRL } from "@/lib/billing";

/** O texto que vai na imagem do story de um carro. Pronto para desenhar: quem desenha não decide nada. */
export type CardDoStory = {
  loja: string;
  titulo: string;
  versao: string | null;
  ano: string;
  km: string | null;
  detalhes: string[];
  /** Nulo = "sob consulta" (o carro ou a loja esconde o preço do público). */
  preco: string | null;
  link: string | null;
};

type CarroDoStory = {
  marca: string;
  modelo: string;
  versao: string | null;
  anoFabricacao: number;
  anoModelo: number;
  km: number;
  kmInformado: boolean;
  zeroKm: boolean;
  ocultarKm: boolean;
  ocultarPreco: boolean;
  precoCents: number;
  cambio: string | null;
  combustivel: string | null;
  cor: string | null;
};

/**
 * O story é público: segue o que a loja já escolheu mostrar no site. Preço escondido no carro ou na loja vira "sob
 * consulta"; km escondida ou nunca informada não aparece (nunca "0 km" por engano); 0 km de verdade aparece como "0 km".
 */
export function montarCardDoStory(v: CarroDoStory, loja: { nome: string; ocultarPrecoNoSite?: boolean; ocultarKmNoSite?: boolean }, link: string | null): CardDoStory {
  const km = v.zeroKm ? "0 km" : v.ocultarKm || loja.ocultarKmNoSite || !v.kmInformado || v.km <= 0 ? null : `${v.km.toLocaleString("pt-BR")} km`;
  const escondePreco = v.ocultarPreco || !!loja.ocultarPrecoNoSite || v.precoCents <= 0;
  return {
    loja: loja.nome,
    titulo: `${v.marca} ${v.modelo}`.trim(),
    versao: v.versao?.trim() || null,
    ano: v.anoFabricacao === v.anoModelo ? String(v.anoModelo) : `${v.anoFabricacao}/${v.anoModelo}`,
    km,
    detalhes: [v.cambio, v.combustivel, v.cor].map((d) => d?.trim()).filter((d): d is string => !!d),
    preco: escondePreco ? null : centsToBRL(v.precoCents),
    link,
  };
}
