import { ErroNapista, type OfertaNapista } from "./cliente";

/**
 * Tolerâncias do envio ao NaPista para dois erros reais vistos em produção, sem depender do que o
 * NaPista aceita de fato (a documentação deles é fechada por senha):
 *  - 412 "maximum number of photos in this Offer has been reached": o limite de fotos é menor que o
 *    nosso, ou o anúncio adotado já tem fotos do sistema antigo. Reduzimos a lista em passos até caber;
 *    se nem 5 fotos cabem, o anúncio já está cheio e seguimos com as fotos que ele tem.
 *  - 400 "Failed to read request": o corpo tem um valor que o NaPista não reconhece. O candidato mais
 *    provável são os equipamentos (códigos de lista fixa); sem eles o anúncio vai assim mesmo, em vez de
 *    ficar parado por um opcional.
 */

export const LIMITE_INICIAL_DE_FOTOS = 20;
const MENOR_LOTE_DE_FOTOS = 5;

/** O que aprendemos sobre o limite de fotos; vale enquanto o processo roda e é refeito sozinho. */
export type EstadoDeFotos = { limite: number };
export const novoEstadoDeFotos = (): EstadoDeFotos => ({ limite: LIMITE_INICIAL_DE_FOTOS });

const ehLimiteDeFotos = (e: unknown) => e instanceof ErroNapista && e.http === 412 && /photo/i.test(e.message);

export async function enviarFotosNapista(
  sessao: { fotosPorUrl: (id: string, urls: string[]) => Promise<void> },
  id: string,
  urls: string[],
  estado: EstadoDeFotos,
): Promise<{ enviadas: number; cheio: boolean }> {
  let lista = urls.slice(0, estado.limite);
  for (;;) {
    try {
      await sessao.fotosPorUrl(id, lista);
      return { enviadas: lista.length, cheio: false };
    } catch (e) {
      if (!ehLimiteDeFotos(e)) throw e;
      if (lista.length <= MENOR_LOTE_DE_FOTOS) return { enviadas: 0, cheio: true };
      estado.limite = Math.max(MENOR_LOTE_DE_FOTOS, Math.floor(lista.length * 0.7));
      lista = lista.slice(0, estado.limite);
    }
  }
}

/** Faz a chamada com a oferta; se o NaPista não conseguir ler o corpo (400) e ele leva equipamentos, tenta de novo sem eles. */
export async function comEquipamentosOpcionais<T>(oferta: OfertaNapista, fazer: (o: OfertaNapista) => Promise<T>): Promise<{ resultado: T; semEquipamentos: boolean }> {
  try {
    return { resultado: await fazer(oferta), semEquipamentos: false };
  } catch (e) {
    if (e instanceof ErroNapista && e.http === 400 && oferta.equipments?.length) {
      const { equipments: _omitidos, ...resto } = oferta;
      return { resultado: await fazer(resto), semEquipamentos: true };
    }
    throw e;
  }
}

/** Os campos do anúncio sem texto longo, para o erro mostrar o que foi enviado quando o NaPista recusa (400). */
export function resumoDaOferta(o: OfertaNapista): string {
  const { description: _d, ...resto } = o;
  return JSON.stringify(resto).slice(0, 400);
}
