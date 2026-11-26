import { ErroNapista, type OfertaNapista } from "./cliente";

/**
 * Tolerâncias do envio ao NaPista para dois erros reais vistos em produção, sem depender do que o
 * NaPista aceita de fato (a documentação deles é fechada por senha):
 *  - 412 "maximum number of photos in this Offer has been reached": as fotos enviadas SOMAM às que o
 *    anúncio já tem, então cada tentativa antiga empilhava mais 20. Agora apagamos as fotos antes de enviar
 *    e, se o limite do NaPista for menor que o nosso, reduzimos a lista em passos até caber.
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

/**
 * Deixa no anúncio exatamente estas fotos. O NaPista SOMA as fotos enviadas às que o anúncio já tem
 * (confirmado na documentação), então apaga todas antes, a não ser que o anúncio acabou de ser criado.
 * Se o limite estourar (412), apaga de novo, reduz a lista e tenta outra vez; o limite aprendido vale para os próximos carros.
 */
export async function enviarFotosNapista(
  sessao: { fotosPorUrl: (id: string, urls: string[]) => Promise<void>; apagarFotos: (id: string) => Promise<void> },
  id: string,
  urls: string[],
  estado: EstadoDeFotos,
  recemCriado = false,
): Promise<{ enviadas: number }> {
  let lista = urls.slice(0, estado.limite);
  let limpo = recemCriado;
  for (;;) {
    if (!limpo) await sessao.apagarFotos(id);
    limpo = false;
    try {
      await sessao.fotosPorUrl(id, lista);
      return { enviadas: lista.length };
    } catch (e) {
      if (!ehLimiteDeFotos(e) || lista.length <= MENOR_LOTE_DE_FOTOS) throw e;
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
