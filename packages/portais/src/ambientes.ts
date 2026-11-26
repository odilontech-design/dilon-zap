import { baseDoMercadoLivre } from "./mercadolivre/cliente";
import { baseDaMobiauto } from "./mobiauto/cliente";
import { baseDoNapista } from "./napista/cliente";
import { baseDaOlx } from "./olx/cliente";
import { baseDaWebmotors } from "./webmotors/cliente";

/**
 * Em que ambiente cada portal está falando: produção (anúncio de verdade) ou teste (o anúncio existe só no ambiente de
 * testes do portal e não aparece no site). Decidido pelo endereço, que vem das variáveis de ambiente. O NaPista ficou
 * meses no ambiente de teste sem ninguém perceber; isto existe para isso não se repetir.
 */
const PADRAO_DE_TESTE = /(^|[./-])(development|dev|homolog\w*|hportal|hml|sandbox|staging|stage|test\w*|localhost|127\.0\.0\.1)([./:-]|$)/i;

export type AmbienteDoPortal = { portal: "WEBMOTORS" | "MOBIAUTO" | "NAPISTA" | "OLX" | "MERCADO_LIVRE"; nome: string; teste: boolean; endereco: string };

export const ehEnderecoDeTeste = (endereco: string) => PADRAO_DE_TESTE.test(endereco);

export function ambientesDosPortais(): AmbienteDoPortal[] {
  const lista: [AmbienteDoPortal["portal"], string, string][] = [
    ["WEBMOTORS", "Webmotors", baseDaWebmotors()],
    ["MOBIAUTO", "MobiAuto", baseDaMobiauto()],
    ["NAPISTA", "NaPista", baseDoNapista()],
    ["OLX", "OLX", baseDaOlx()],
    ["MERCADO_LIVRE", "Mercado Livre", baseDoMercadoLivre()],
  ];
  return lista.map(([portal, nome, endereco]) => ({ portal, nome, endereco, teste: ehEnderecoDeTeste(endereco) }));
}
