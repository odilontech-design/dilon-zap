import type { Expansao } from "./tipologia";

/**
 * Relação de materiais (lista de compra).
 *
 * Agrega o que várias esquadrias de um orçamento consomem, somando por
 * insumo. É o documento que a serralheria leva pro fornecedor, então a
 * unidade importa: alumínio se compra em BARRA (e em kg pro preço), vidro em
 * m², ferragem em peça. Mostrar alumínio em metros lineares seria correto e
 * inútil — ninguém vende 47,3 metros de perfil.
 */

export type TipoMaterial = "ALUMINIO" | "VIDRO" | "FERRAGEM";

export type LinhaMaterial = {
  tipo: TipoMaterial;
  insumoId: string;
  codigo: string;
  nome: string;
  unidade: string;
  quantidade: number;
  detalhe: string;
  custoCentavos: number;
};

export type EntradaMaterial = {
  expansao: Expansao;
  /** Barras necessárias por perfil, vindo do plano de corte (quando houver). */
  barrasPorPerfil?: Record<string, number>;
};

export function agregarMateriais(entradas: EntradaMaterial[]): LinhaMaterial[] {
  const linhas = new Map<string, LinhaMaterial>();

  const acumular = (chave: string, base: Omit<LinhaMaterial, "quantidade" | "custoCentavos">, quantidade: number, custo: number) => {
    const atual = linhas.get(chave);
    if (atual) {
      atual.quantidade += quantidade;
      atual.custoCentavos += custo;
    } else {
      linhas.set(chave, { ...base, quantidade, custoCentavos: custo });
    }
  };

  // Metros e peso por perfil são somados à parte: quando não há plano de
  // corte, a quantidade de barras é estimada por metro linear — sempre PRA
  // CIMA, porque comprar barra a menos para a obra.
  const metrosPorPerfil = new Map<string, { metros: number; barraMm: number; peso: number }>();

  for (const entrada of entradas) {
    for (const p of entrada.expansao.pecas) {
      const metros = (p.comprimentoMm / 1000) * p.quantidade;
      const acc = metrosPorPerfil.get(p.perfilId) ?? { metros: 0, barraMm: p.comprimentoBarraMm, peso: 0 };
      acc.metros += metros;
      acc.peso += p.pesoTotalKg;
      metrosPorPerfil.set(p.perfilId, acc);

      acumular(
        `ALUMINIO:${p.perfilId}`,
        { tipo: "ALUMINIO", insumoId: p.perfilId, codigo: p.perfilCodigo, nome: p.perfilNome, unidade: "barra", detalhe: "" },
        0,
        p.custoCentavos,
      );
    }

    for (const v of entrada.expansao.vidros) {
      acumular(
        `VIDRO:${v.vidroId}`,
        { tipo: "VIDRO", insumoId: v.vidroId, codigo: "", nome: v.vidroNome, unidade: "m²", detalhe: "" },
        Number((v.m2CobradoUnitario * v.quantidade).toFixed(3)),
        v.custoCentavos,
      );
    }

    for (const f of entrada.expansao.ferragens) {
      acumular(
        `FERRAGEM:${f.ferragemId}`,
        { tipo: "FERRAGEM", insumoId: f.ferragemId, codigo: "", nome: f.ferragemNome, unidade: f.unidade, detalhe: "" },
        f.quantidade,
        f.custoCentavos,
      );
    }
  }

  const barras = entradas.reduce<Record<string, number>>((acc, e) => {
    for (const [perfilId, qtd] of Object.entries(e.barrasPorPerfil ?? {})) acc[perfilId] = (acc[perfilId] ?? 0) + qtd;
    return acc;
  }, {});

  for (const [perfilId, dados] of metrosPorPerfil) {
    const linha = linhas.get(`ALUMINIO:${perfilId}`);
    if (!linha) continue;
    const barrasDoPlano = barras[perfilId];
    linha.quantidade = barrasDoPlano ?? Math.ceil((dados.metros * 1000) / dados.barraMm);
    linha.detalhe = `${dados.metros.toFixed(2)} m lineares · ${dados.peso.toFixed(2)} kg${barrasDoPlano ? " · plano de corte" : " · estimado"}`;
  }

  const ordem: TipoMaterial[] = ["ALUMINIO", "VIDRO", "FERRAGEM"];
  return [...linhas.values()].sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo) || a.nome.localeCompare(b.nome));
}
