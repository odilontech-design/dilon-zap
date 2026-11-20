import { escolhaSegura, sugerir } from "../olx/catalogo";
import type { CarroParaPortal } from "../olx/mapa";
import type { ItemNapista, SessaoNapista } from "./cliente";

/**
 * Descobre a versão do catálogo do NaPista para um carro, a partir dos nomes da ficha (marca →
 * modelo → versão, as duas últimas filtradas pelo ano do modelo). A escolha automática só vale
 * quando a melhor opção é clara; senão devolve o que falta para a gestão escolher.
 */

export type CatalogosNapista = { marcas?: ItemNapista[]; modelos: Map<string, ItemNapista[]>; versoes: Map<string, ItemNapista[]> };
export const novosCatalogosNapista = (): CatalogosNapista => ({ modelos: new Map(), versoes: new Map() });

const melhor = (procurado: string | null | undefined, lista: ItemNapista[]): ItemNapista | null => {
  if (!procurado || !lista.length) return null;
  // sugerir() trabalha com ids numéricos: usamos a posição na lista como id.
  const e = escolhaSegura(sugerir(procurado, Object.fromEntries(lista.map((i, n) => [i.nome, n]))));
  return e ? lista[Number(e.id)] ?? null : null;
};

export type CatalogoNapista = { versao?: string; versaoNome?: string };

export async function resolverCatalogoNapista(
  sessao: Pick<SessaoNapista, "marcas" | "modelos" | "versoes">,
  c: Pick<CarroParaPortal, "marca" | "modelo" | "versao" | "anoModelo">,
  cache: CatalogosNapista,
): Promise<{ catalogo: CatalogoNapista; pendencias: string[] }> {
  cache.marcas ??= await sessao.marcas();
  const marca = melhor(c.marca, cache.marcas);
  if (!marca) return { catalogo: {}, pendencias: [`Marca "${c.marca}" não identificada no catálogo do NaPista`] };
  const km = `${marca.id}/${c.anoModelo}`;
  if (!cache.modelos.has(km)) cache.modelos.set(km, await sessao.modelos(marca.id, c.anoModelo));
  const modelo = melhor(c.modelo, cache.modelos.get(km)!);
  if (!modelo) return { catalogo: {}, pendencias: [`Modelo "${c.modelo}" (${c.anoModelo}) não identificado no catálogo do NaPista`] };
  const kv = `${modelo.id}/${c.anoModelo}`;
  if (!cache.versoes.has(kv)) cache.versoes.set(kv, await sessao.versoes(modelo.id, c.anoModelo));
  const lista = cache.versoes.get(kv)!;
  // Modelo com uma versão só naquele ano: não há o que escolher.
  const versao = lista.length === 1 ? lista[0] : melhor(c.versao, lista);
  if (!versao) return { catalogo: {}, pendencias: [`Versão "${c.versao ?? "sem versão"}" não identificada no catálogo do NaPista`] };
  return { catalogo: { versao: versao.id, versaoNome: versao.nome }, pendencias: [] };
}
