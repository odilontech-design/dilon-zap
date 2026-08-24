import { PrismaClient, type CategoriaTipologia, type TipoCorte } from "@prisma-erp/client";

/**
 * Catálogo de FERRO/AÇO instalável numa empresa que já existe.
 *
 * Serralheria que trabalha com ferro não precisa de outro sistema: o motor é
 * o mesmo (perfil custa kg/m × R$/kg × barra, corte é otimizado na barra,
 * quantidade sai de fórmula). O que muda é o insumo. Este script instala a
 * linha de ferro ao lado da de alumínio na MESMA empresa — quem vende os dois
 * orça os dois no mesmo orçamento.
 *
 * Uso: npm run db:ferro -w @dilon-zap/erp-db -- --empresa=vidracaria-modelo
 *
 * Idempotente: roda de novo sem duplicar. As tipologias são recriadas (é o
 * jeito de a atualização do script chegar em quem já rodou), então NÃO edite
 * as tipologias instaladas por aqui — duplique e ajuste a cópia.
 */

const prisma = new PrismaClient();
const REAIS = (v: number) => Math.round(v * 100);

const SLUG_PADRAO = "vidracaria-modelo";

/**
 * Peso teórico do aço (densidade 7,85 kg/dm³) — é constante e não muda de
 * fornecedor. O preço por kg é o oposto: é o número que a serralheria
 * atualiza toda vez que o distribuidor reajusta, e é o único que ela precisa
 * manter em dia pro orçamento sair certo. Os daqui são ponto de partida.
 */
const PERFIS = [
  { codigo: "MET-20x20-1.20", nome: "Metalon 20x20 - 1,20mm", pesoPorMetro: 0.71, preco: 10.5, barra: 6000 },
  { codigo: "MET-30x30-1.20", nome: "Metalon 30x30 - 1,20mm", pesoPorMetro: 1.08, preco: 10.5, barra: 6000 },
  { codigo: "MET-40x40-1.50", nome: "Metalon 40x40 - 1,50mm", pesoPorMetro: 1.81, preco: 10.5, barra: 6000 },
  { codigo: "MET-50x30-1.50", nome: "Metalon 50x30 - 1,50mm", pesoPorMetro: 1.81, preco: 10.5, barra: 6000 },
  { codigo: "CANT-1x1/8", nome: 'Cantoneira 1" x 1/8"', pesoPorMetro: 1.19, preco: 9.8, barra: 6000 },
  { codigo: "CHATA-1x1/8", nome: 'Barra chata 1" x 1/8"', pesoPorMetro: 0.63, preco: 9.8, barra: 6000 },
  { codigo: "TUBO-1-1.20", nome: 'Tubo redondo 1" - 1,20mm', pesoPorMetro: 0.72, preco: 11.2, barra: 6000 },
  // Vergalhão vem em barra de 12m, não de 6m. O comprimento da barra é por
  // perfil justamente por isso — o plano de corte usa o que foi comprado.
  { codigo: "VERG-3/8", nome: 'Vergalhão CA-50 3/8"', pesoPorMetro: 0.62, preco: 8.5, barra: 12000 },
];

/**
 * `fracionavel` é o que separa consumível de peça. Eletrodo, trilho e tinta
 * são comprados a granel e a fórmula devolve fração (0,48 kg de eletrodo);
 * roldana e fechadura são peça e continuam arredondando pra cima.
 */
const FERRAGENS = [
  { nome: "Eletrodo 6013 2,50mm", unidade: "kg", preco: 32.0, fracionavel: true },
  { nome: "Fundo anticorrosivo", unidade: "m²", preco: 7.5, fracionavel: true },
  { nome: "Tinta esmalte sintético", unidade: "m²", preco: 11.0, fracionavel: true },
  { nome: "Trilho para portão de correr", unidade: "m", preco: 46.0, fracionavel: true },
  { nome: "Disco de corte 7\"", unidade: "pç", preco: 9.9, fracionavel: false },
  { nome: "Chumbador parabolt 3/8\"", unidade: "pç", preco: 4.8, fracionavel: false },
  { nome: "Roldana para portão de correr", unidade: "pç", preco: 38.0, fracionavel: false },
  { nome: "Fechadura de portão externa", unidade: "pç", preco: 129.0, fracionavel: false },
  { nome: "Puxador tubular 40cm", unidade: "pç", preco: 55.0, fracionavel: false },
];

type Def = {
  nome: string;
  categoria: CategoriaTipologia;
  descricao: string;
  parametros: { chave: string; rotulo: string; valorPadrao: number }[];
  pecas: { descricao: string; perfil: string; corte: TipoCorte; qtd: string; comp: string }[];
  ferragens: { ferragem: string; descricao: string; qtd: string }[];
};

const TIPOLOGIAS: Def[] = [
  {
    nome: "Grade de proteção - metalon",
    categoria: "JANELA",
    descricao:
      "Moldura em metalon 30x30 com barras verticais em 20x20. O número de barras sai do vão: teto((L - folga) / espaçamento) - 1.",
    parametros: [
      { chave: "espacamento", rotulo: "Espaçamento máx. entre barras (mm)", valorPadrao: 110 },
      { chave: "folga", rotulo: "Folga total no vão (mm)", valorPadrao: 10 },
    ],
    pecas: [
      { descricao: "Moldura horizontal (30x30)", perfil: "MET-30x30-1.20", corte: "RETO", qtd: "2", comp: "L - folga" },
      { descricao: "Moldura vertical (30x30)", perfil: "MET-30x30-1.20", corte: "RETO", qtd: "2", comp: "H - folga - 60" },
      {
        descricao: "Barra vertical (20x20)",
        perfil: "MET-20x20-1.20",
        corte: "RETO",
        qtd: "teto((L - folga) / espacamento) - 1",
        comp: "H - folga - 60",
      },
    ],
    ferragens: [
      { ferragem: "Chumbador parabolt 3/8\"", descricao: "Fixação no vão", qtd: "8" },
      { ferragem: "Eletrodo 6013 2,50mm", descricao: "Solda", qtd: "0,04 * (teto((L - folga) / espacamento) + 3)" },
      { ferragem: "Fundo anticorrosivo", descricao: "Fundo, 2 faces", qtd: "AREA * 2" },
      { ferragem: "Tinta esmalte sintético", descricao: "Acabamento, 2 faces", qtd: "AREA * 2" },
    ],
  },
  {
    nome: "Portão de correr - metalon",
    categoria: "PORTA",
    descricao:
      "Quadro em metalon 50x30, travessa 40x40 (duas acima de 1,80m de altura), gradil 20x20 e reforço diagonal em barra chata.",
    parametros: [
      { chave: "espacamento", rotulo: "Espaçamento máx. entre barras (mm)", valorPadrao: 120 },
      { chave: "transpasse", rotulo: "Transpasse do trilho (mm)", valorPadrao: 300 },
    ],
    pecas: [
      { descricao: "Quadro horizontal (50x30)", perfil: "MET-50x30-1.50", corte: "RETO", qtd: "2", comp: "L" },
      { descricao: "Quadro vertical (50x30)", perfil: "MET-50x30-1.50", corte: "RETO", qtd: "2", comp: "H - 100" },
      { descricao: "Travessa central (40x40)", perfil: "MET-40x40-1.50", corte: "RETO", qtd: "se(H > 1800, 2, 1)", comp: "L - 100" },
      { descricao: "Gradil vertical (20x20)", perfil: "MET-20x20-1.20", corte: "RETO", qtd: "teto(L / espacamento) - 1", comp: "H - 100" },
      {
        descricao: "Reforço diagonal (chata)",
        perfil: "CHATA-1x1/8",
        corte: "RETO",
        qtd: "2",
        comp: "raiz((L/2)*(L/2) + (H-100)*(H-100))",
      },
    ],
    ferragens: [
      { ferragem: "Roldana para portão de correr", descricao: "Roldanas", qtd: "4" },
      { ferragem: "Trilho para portão de correr", descricao: "Trilho", qtd: "(L + transpasse) / 1000" },
      { ferragem: "Fechadura de portão externa", descricao: "Fechadura", qtd: "1" },
      { ferragem: "Puxador tubular 40cm", descricao: "Puxadores", qtd: "2" },
      { ferragem: "Eletrodo 6013 2,50mm", descricao: "Solda", qtd: "0,05 * (teto(L / espacamento) + 8)" },
      { ferragem: "Fundo anticorrosivo", descricao: "Fundo, 2 faces", qtd: "AREA * 2" },
      { ferragem: "Tinta esmalte sintético", descricao: "Acabamento, 2 faces", qtd: "AREA * 2" },
    ],
  },
  {
    nome: "Guarda-corpo de ferro - tubo e chata",
    categoria: "GUARDA_CORPO",
    descricao: "Corrimão em tubo redondo, montantes a cada 1,20m e gradil em barra chata. Espaçamento máximo de 110mm por norma.",
    parametros: [
      { chave: "espacamento", rotulo: "Espaçamento máx. entre barras (mm)", valorPadrao: 110 },
      { chave: "vaoMontante", rotulo: "Distância máx. entre montantes (mm)", valorPadrao: 1200 },
    ],
    pecas: [
      { descricao: "Corrimão superior (tubo)", perfil: "TUBO-1-1.20", corte: "RETO", qtd: "1", comp: "L" },
      { descricao: "Travessa inferior (tubo)", perfil: "TUBO-1-1.20", corte: "RETO", qtd: "1", comp: "L" },
      { descricao: "Montante (metalon 30x30)", perfil: "MET-30x30-1.20", corte: "RETO", qtd: "teto(L / vaoMontante) + 1", comp: "H" },
      { descricao: "Gradil vertical (chata)", perfil: "CHATA-1x1/8", corte: "RETO", qtd: "teto(L / espacamento) - 1", comp: "H - 60" },
    ],
    ferragens: [
      { ferragem: "Chumbador parabolt 3/8\"", descricao: "Fixação dos montantes", qtd: "(teto(L / vaoMontante) + 1) * 4" },
      { ferragem: "Eletrodo 6013 2,50mm", descricao: "Solda", qtd: "0,03 * (teto(L / espacamento) + 6)" },
      { ferragem: "Fundo anticorrosivo", descricao: "Fundo, 2 faces", qtd: "AREA * 2" },
      { ferragem: "Tinta esmalte sintético", descricao: "Acabamento, 2 faces", qtd: "AREA * 2" },
    ],
  },
];

async function main() {
  const argSlug = process.argv.find((a) => a.startsWith("--empresa="))?.split("=")[1];
  const slug = argSlug || SLUG_PADRAO;

  const empresa = await prisma.empresa.findUnique({ where: { slug } });
  if (!empresa) {
    console.error(`Empresa "${slug}" não encontrada. Rode com --empresa=<slug> de uma empresa existente.`);
    process.exitCode = 1;
    return;
  }

  const linha = await prisma.linhaPerfil.upsert({
    where: { empresaId_nome: { empresaId: empresa.id, nome: "Ferro / Aço carbono" } },
    update: {},
    create: { empresaId: empresa.id, nome: "Ferro / Aço carbono", descricao: "Metalon, cantoneira, barra chata, tubo e vergalhão" },
  });

  const perfilPorCodigo: Record<string, string> = {};
  for (const p of PERFIS) {
    const r = await prisma.perfil.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: p.codigo } },
      update: {},
      create: {
        empresaId: empresa.id,
        linhaId: linha.id,
        codigo: p.codigo,
        nome: p.nome,
        pesoPorMetro: p.pesoPorMetro,
        precoPorKgCentavos: REAIS(p.preco),
        comprimentoBarraMm: p.barra,
      },
    });
    perfilPorCodigo[p.codigo] = r.id;
  }

  const ferragemPorNome: Record<string, string> = {};
  for (const f of FERRAGENS) {
    const r = await prisma.ferragem.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: f.nome } },
      // `fracionavel` no update porque quem rodou antes da coluna existir
      // ficou com tudo por peça — e é justamente o que arredonda o eletrodo.
      update: { fracionavel: f.fracionavel },
      create: {
        empresaId: empresa.id,
        nome: f.nome,
        unidade: f.unidade,
        precoUnitarioCentavos: REAIS(f.preco),
        fracionavel: f.fracionavel,
      },
    });
    ferragemPorNome[f.nome] = r.id;
  }

  for (const d of TIPOLOGIAS) {
    const existente = await prisma.tipologia.findUnique({ where: { empresaId_nome: { empresaId: empresa.id, nome: d.nome } } });
    if (existente) {
      const emUso = await prisma.orcamentoItem.count({ where: { tipologiaId: existente.id } });
      // Item de orçamento guarda a memória de cálculo dele; ainda assim,
      // apagar uma tipologia já usada quebraria o vínculo do histórico.
      if (emUso > 0) {
        console.log(`- "${d.nome}" já está em ${emUso} item(ns) de orçamento; mantida como está.`);
        continue;
      }
      await prisma.tipologia.delete({ where: { id: existente.id } });
    }

    await prisma.tipologia.create({
      data: {
        empresaId: empresa.id,
        linhaId: linha.id,
        nome: d.nome,
        categoria: d.categoria,
        descricao: d.descricao,
        larguraMinMm: 300,
        larguraMaxMm: 6000,
        alturaMinMm: 300,
        alturaMaxMm: 3000,
        parametros: { create: d.parametros.map((p, i) => ({ ...p, ordem: i })) },
        pecas: {
          create: d.pecas.map((p, i) => ({
            perfilId: perfilPorCodigo[p.perfil],
            descricao: p.descricao,
            corte: p.corte,
            formulaQuantidade: p.qtd,
            formulaComprimento: p.comp,
            ordem: i,
          })),
        },
        ferragens: {
          create: d.ferragens.map((f, i) => ({
            ferragemId: ferragemPorNome[f.ferragem],
            descricao: f.descricao,
            formulaQuantidade: f.qtd,
            ordem: i,
          })),
        },
      },
    });
    console.log(`+ ${d.nome}`);
  }

  console.log(`\nCatálogo de ferro instalado em "${empresa.nome}": ${PERFIS.length} perfis, ${FERRAGENS.length} insumos, ${TIPOLOGIAS.length} tipologias.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
