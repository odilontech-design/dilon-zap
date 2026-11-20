import { escolhaSegura, nota, sugerir } from "../olx/catalogo";
import { normalizar } from "../texto";
import type { CarroParaPortal } from "../olx/mapa";
import type { ItemMobi, SessaoMobiauto } from "./cliente";
import type { CatalogoMobiauto } from "./mapa";

/**
 * Descobre os IDs do catálogo da MobiAuto para um carro, a partir dos nomes da ficha. A escolha
 * automática só vale quando a melhor opção é clara (mesma regra da OLX e da Webmotors); senão
 * devolve o que falta para a gestão escolher. Catálogos grandes ficam em cache no ciclo todo.
 */

export type CatalogosMobi = {
  marcas?: ItemMobi[];
  cores?: ItemMobi[];
  cambios?: ItemMobi[];
  combustiveis?: ItemMobi[];
  opcionais?: ItemMobi[];
  modelos: Map<number, ItemMobi[]>;
  versoes: Map<number, ItemMobi[]>;
};

export const novosCatalogosMobi = (): CatalogosMobi => ({ modelos: new Map(), versoes: new Map() });

const melhor = (procurado: string | null | undefined, itens: ItemMobi[]): ItemMobi | null => {
  if (!procurado || !itens.length) return null;
  const e = escolhaSegura(sugerir(procurado, Object.fromEntries(itens.map((i) => [i.nome, i.id]))));
  return e ? itens.find((i) => i.id === Number(e.id)) ?? null : null;
};

const ALIAS_CAMBIO: [RegExp, string][] = [[/automatizad/, "automatizado"], [/cvt/, "cvt"], [/autom/, "automatico"], [/manual/, "manual"]];
const ALIAS_COMBUSTIVEL: [RegExp, string][] = [[/hibrid/, "hibrido"], [/eletric/, "eletrico"], [/flex/, "flex"], [/diesel/, "diesel"], [/etanol|alcool/, "alcool"], [/gasolina/, "gasolina"], [/gnv/, "gnv"]];
const alias = (t: string | null, tabela: [RegExp, string][]) => {
  const n = normalizar(t ?? "");
  return tabela.find(([re]) => re.test(n))?.[1] ?? (n || null);
};

export type ResolucaoMobi = { catalogo: Partial<CatalogoMobiauto>; pendencias: string[] };

export async function resolverCatalogoMobiauto(
  sessao: Pick<SessaoMobiauto, "marcas" | "modelos" | "versoes" | "cores" | "cambios" | "combustiveis" | "opcionais">,
  c: Pick<CarroParaPortal, "marca" | "modelo" | "versao" | "anoModelo" | "cor" | "cambio" | "combustivel" | "opcionais">,
  cache: CatalogosMobi,
): Promise<ResolucaoMobi> {
  const pendencias: string[] = [];
  const cat: Partial<CatalogoMobiauto> = {};

  cache.marcas ??= await sessao.marcas();
  const marca = melhor(c.marca, cache.marcas);
  if (!marca) pendencias.push(`Marca "${c.marca}" não identificada no catálogo da MobiAuto`);
  else {
    cat.marca = marca.nome;
    if (!cache.modelos.has(marca.id)) cache.modelos.set(marca.id, await sessao.modelos(marca.id));
    const modelo = melhor(c.modelo, cache.modelos.get(marca.id)!);
    if (!modelo) pendencias.push(`Modelo "${c.modelo}" não identificado no catálogo da MobiAuto`);
    else {
      cat.modelo = modelo.nome;
      if (!cache.versoes.has(modelo.id)) cache.versoes.set(modelo.id, await sessao.versoes(modelo.id));
      // Só as versões fabricadas no ano do modelo (quando o catálogo informa o período).
      const todas = cache.versoes.get(modelo.id)!;
      const doAno = todas.filter((v) => (!v.inicio || v.inicio <= c.anoModelo) && (!v.fim || v.fim >= c.anoModelo));
      const versao = melhor(c.versao, doAno.length ? doAno : todas);
      if (versao) {
        cat.trim = versao.id;
        cat.trimNome = versao.nome;
      } else pendencias.push(`Versão "${c.versao ?? "sem versão"}" não identificada no catálogo da MobiAuto`);
    }
  }

  cache.cores ??= await sessao.cores();
  cat.cor = melhor(c.cor, cache.cores)?.id ?? 0;
  cache.cambios ??= await sessao.cambios();
  cat.cambio = melhor(alias(c.cambio, ALIAS_CAMBIO), cache.cambios)?.id ?? 0;
  cache.combustiveis ??= await sessao.combustiveis();
  cat.combustivel = melhor(alias(c.combustivel, ALIAS_COMBUSTIVEL), cache.combustiveis)?.id ?? 0;

  if (c.opcionais.length) {
    cache.opcionais ??= await sessao.opcionais();
    const achados = new Set<number>();
    for (const o of c.opcionais.flatMap((x) => x.split(/[,;]/)).map((x) => x.trim()).filter(Boolean)) {
      const m = cache.opcionais.map((i) => ({ i, n: nota(o, i.nome) })).sort((a, b) => b.n - a.n)[0];
      if (m && m.n >= 0.9) achados.add(m.i.id);
    }
    cat.opcionais = [...achados];
  }
  return { catalogo: cat, pendencias };
}

export function catalogoMobiCompleto<T extends Partial<CatalogoMobiauto>>(c: T | null | undefined): c is T & CatalogoMobiauto {
  return !!c && !!c.trim && !!c.cor && !!c.cambio && !!c.combustivel;
}
