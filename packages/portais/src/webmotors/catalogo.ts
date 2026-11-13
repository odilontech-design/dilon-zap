import { escolhaSegura, nota, sugerir } from "../olx/catalogo";
import { normalizar } from "../texto";
import type { ItemCatalogo, SessaoWebmotors } from "./cliente";
import type { CarroParaPortal } from "../olx/mapa";
import type { CatalogoWebmotors } from "./mapa";

/**
 * Descobre os códigos do catálogo da Webmotors para um carro, a partir dos nomes da ficha
 * ("Fiat", "Argo", "1.0 FIREFLY…", "Branco"…). A escolha automática só vale quando a melhor
 * opção é clara (a mesma regra da OLX); quando não é, devolve o que falta para a gestão
 * escolher na ficha. Os catálogos grandes (marcas, cores…) ficam em cache para o ciclo todo.
 */

export type Catalogos = {
  marcas?: ItemCatalogo[];
  cores?: ItemCatalogo[];
  cambios?: ItemCatalogo[];
  combustiveis?: ItemCatalogo[];
  opcionais?: ItemCatalogo[];
  modelos: Map<string, ItemCatalogo[]>;
  versoes: Map<string, (ItemCatalogo & { anos: number[] })[]>;
};

export const novosCatalogos = (): Catalogos => ({ modelos: new Map(), versoes: new Map() });

const comoRegistro = (itens: { codigo: string; nome: string }[]) => Object.fromEntries(itens.map((i) => [i.nome, i.codigo]));

function melhor(procurado: string | null | undefined, itens: { codigo: string; nome: string }[]): string | null {
  if (!procurado || !itens.length) return null;
  return escolhaSegura(sugerir(procurado, comoRegistro(itens)))?.id ?? null;
}

/** Aliases de câmbio e combustível da ficha para o jeito que o catálogo costuma escrever. */
const ALIAS_CAMBIO: [RegExp, string][] = [[/automatizad/, "automatizado"], [/cvt/, "cvt"], [/autom/, "automatico"], [/manual/, "manual"]];
const ALIAS_COMBUSTIVEL: [RegExp, string][] = [[/hibrid/, "hibrido"], [/eletric/, "eletrico"], [/flex/, "flex"], [/diesel/, "diesel"], [/etanol|alcool/, "alcool"], [/gasolina/, "gasolina"], [/gnv/, "gnv"]];
function alias(texto: string | null, tabela: [RegExp, string][]): string | null {
  const n = normalizar(texto ?? "");
  return tabela.find(([re]) => re.test(n))?.[1] ?? (n || null);
}

export type ResolucaoCatalogo = { catalogo: Partial<CatalogoWebmotors>; pendencias: string[] };

export async function resolverCatalogo(
  sessao: Pick<SessaoWebmotors, "marcas" | "modelos" | "versoes" | "cores" | "cambios" | "combustiveis" | "opcionais">,
  c: Pick<CarroParaPortal, "marca" | "modelo" | "versao" | "anoModelo" | "cor" | "cambio" | "combustivel" | "opcionais">,
  cache: Catalogos,
): Promise<ResolucaoCatalogo> {
  const pendencias: string[] = [];
  const cat: Partial<CatalogoWebmotors> = {};

  cache.marcas ??= await sessao.marcas();
  const marca = melhor(c.marca, cache.marcas);
  if (!marca) pendencias.push(`Marca "${c.marca}" não identificada no catálogo da Webmotors`);
  else {
    cat.marca = marca;
    if (!cache.modelos.has(marca)) cache.modelos.set(marca, await sessao.modelos(marca));
    const modelo = melhor(c.modelo, cache.modelos.get(marca)!);
    if (!modelo) pendencias.push(`Modelo "${c.modelo}" não identificado no catálogo da Webmotors`);
    else {
      cat.modelo = modelo;
      if (!cache.versoes.has(modelo)) cache.versoes.set(modelo, await sessao.versoes(modelo));
      // Só as versões que existem no ano do modelo (quando a Webmotors informa os anos).
      const todas = cache.versoes.get(modelo)!;
      const doAno = todas.filter((v) => !v.anos.length || v.anos.includes(c.anoModelo));
      const versao = melhor(c.versao, doAno.length ? doAno : todas);
      if (versao) cat.versao = versao;
      else pendencias.push(`Versão "${c.versao ?? "sem versão"}" não identificada no catálogo da Webmotors`);
    }
  }

  cache.cores ??= await sessao.cores();
  cat.cor = melhor(c.cor, cache.cores) ?? "";
  cache.cambios ??= await sessao.cambios();
  const camb = alias(c.cambio, ALIAS_CAMBIO);
  cat.cambio = melhor(camb, cache.cambios) ?? "";
  cache.combustiveis ??= await sessao.combustiveis();
  const comb = alias(c.combustivel, ALIAS_COMBUSTIVEL);
  cat.combustivel = melhor(comb, cache.combustiveis) ?? "";

  // Opcionais: só os que a Webmotors reconhece com clareza (nota alta); o resto fica fora sem travar o anúncio.
  if (c.opcionais.length) {
    cache.opcionais ??= await sessao.opcionais();
    const achados = new Set<number>();
    for (const o of c.opcionais.flatMap((x) => x.split(/[,;]/)).map((x) => x.trim()).filter(Boolean)) {
      const m = cache.opcionais.map((i) => ({ i, n: nota(o, i.nome) })).sort((a, b) => b.n - a.n)[0];
      if (m && m.n >= 0.9) achados.add(Number(m.i.codigo));
    }
    cat.opcionais = [...achados].filter(Number.isFinite);
  }
  return { catalogo: cat, pendencias };
}

/** O catálogo está completo para montar o anúncio? */
export function catalogoCompleto(c: Partial<CatalogoWebmotors> | null | undefined): c is CatalogoWebmotors {
  return !!c && !!c.marca && !!c.modelo && !!c.versao && !!c.cor && !!c.cambio && !!c.combustivel;
}
