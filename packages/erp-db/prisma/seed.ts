import bcrypt from "bcryptjs";
import { PrismaClient, type CategoriaTipologia, type TipoCorte } from "@prisma-erp/client";

const prisma = new PrismaClient();

/**
 * Seed = a empresa de demonstração + o catálogo inicial.
 *
 * O catálogo importa mais do que parece: uma serralheria que entra no sistema
 * e encontra a tela de tipologias vazia não vira cliente — ela abandona antes
 * de cadastrar o terceiro perfil. Aqui ela já entra com a linha 25 montada e
 * seis tipologias funcionando, que ela DUPLICA e ajusta pros números dela.
 * É o oposto do catálogo fechado de "+3400 tipologias" que ninguém edita.
 *
 * Idempotente: pode rodar de novo sem duplicar nada.
 */

const REAIS = (v: number) => Math.round(v * 100);

async function main() {
  const empresa = await prisma.empresa.upsert({
    where: { slug: "vidracaria-modelo" },
    update: {},
    create: {
      nome: "Vidraçaria Modelo",
      slug: "vidracaria-modelo",
      cidade: "São Paulo",
      uf: "SP",
      telefone: "(11) 99999-0000",
      plano: "AVANCADO",
      margemLucroPercent: 100,
      maoDeObraPorM2Centavos: REAIS(45),
      perdaAluminioPercent: 8,
      impostoPercent: 6,
      validadeOrcamentoDias: 15,
      condicoesPadrao:
        "Validade da proposta: 15 dias. Prazo de entrega: 20 dias úteis após aprovação e pagamento da entrada. Medidas sujeitas a conferência no local.",
    },
  });

  const senhaHash = await bcrypt.hash("troque-esta-senha", 10);
  const usuarios = [
    { nome: "Responsável", email: "dono@vidracariamodelo.com.br", papel: "OWNER" as const, comissaoPercent: 0 },
    { nome: "Vendedor Demo", email: "vendas@vidracariamodelo.com.br", papel: "VENDEDOR" as const, comissaoPercent: 3 },
    { nome: "Produção Demo", email: "producao@vidracariamodelo.com.br", papel: "PRODUCAO" as const, comissaoPercent: 0 },
    { nome: "Financeiro Demo", email: "financeiro@vidracariamodelo.com.br", papel: "FINANCEIRO" as const, comissaoPercent: 0 },
  ];
  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, empresaId: empresa.id, senhaHash },
    });
  }

  // Superadmin da Dilon Tech. Fica preso à empresa de demonstração só porque
  // o schema exige um vínculo; o acesso dele é cross-tenant pelo /admin.
  await prisma.usuario.upsert({
    where: { email: "admin@dilontech.com.br" },
    update: {},
    create: { nome: "Dilon Tech", email: "admin@dilontech.com.br", papel: "SUPERADMIN", empresaId: empresa.id, senhaHash },
  });

  // ── Cores ────────────────────────────────────────────────────────────────
  // Os fatores são os do mercado: anodizado e pintura eletrostática saem mais
  // caros que o alumínio natural, e amadeirado (sublimação) é o mais caro.
  const cores = [
    { nome: "Branco", hex: "#FFFFFF", fatorAluminio: 1.0, fatorFerragem: 1.0, ordem: 1 },
    { nome: "Preto", hex: "#111111", fatorAluminio: 1.18, fatorFerragem: 1.1, ordem: 2 },
    { nome: "Amadeirado", hex: "#8B5A2B", fatorAluminio: 1.45, fatorFerragem: 1.0, ordem: 3 },
    { nome: "Aço corten", hex: "#8A3B12", fatorAluminio: 1.5, fatorFerragem: 1.0, ordem: 4 },
    { nome: "Fosco", hex: "#B8BCC0", fatorAluminio: 1.25, fatorFerragem: 1.0, ordem: 5 },
    { nome: "Bronze", hex: "#6E5027", fatorAluminio: 1.2, fatorFerragem: 1.05, ordem: 6 },
    { nome: "Natural", hex: "#D9DCDF", fatorAluminio: 1.0, fatorFerragem: 1.0, ordem: 7 },
    { nome: "Cromado", hex: "#C7CDD3", fatorAluminio: 1.0, fatorFerragem: 1.15, ordem: 8 },
  ];
  for (const c of cores) {
    await prisma.cor.upsert({ where: { empresaId_nome: { empresaId: empresa.id, nome: c.nome } }, update: {}, create: { ...c, empresaId: empresa.id } });
  }

  // ── Linhas de perfil ─────────────────────────────────────────────────────
  const linha25 = await prisma.linhaPerfil.upsert({
    where: { empresaId_nome: { empresaId: empresa.id, nome: "Linha 25" } },
    update: {},
    create: { empresaId: empresa.id, nome: "Linha 25", descricao: "Linha popular de correr — janelas e portas residenciais" },
  });
  const linhaBox = await prisma.linhaPerfil.upsert({
    where: { empresaId_nome: { empresaId: empresa.id, nome: "Box / Temperado" } },
    update: {},
    create: { empresaId: empresa.id, nome: "Box / Temperado", descricao: "Perfis de acabamento para vidro temperado" },
  });
  const linhaAbrir = await prisma.linhaPerfil.upsert({
    where: { empresaId_nome: { empresaId: empresa.id, nome: "Linha 30 (abrir)" } },
    update: {},
    create: { empresaId: empresa.id, nome: "Linha 30 (abrir)", descricao: "Portas e janelas de abrir" },
  });

  const PRECO_KG = REAIS(48);

  const perfis = [
    { codigo: "25.01", nome: "Trilho 2 vias", pesoPorMetro: 0.52, linhaId: linha25.id },
    { codigo: "25.02", nome: "Marco lateral", pesoPorMetro: 0.41, linhaId: linha25.id },
    { codigo: "25.03", nome: "Perfil folha (batedor)", pesoPorMetro: 0.38, linhaId: linha25.id },
    { codigo: "25.04", nome: "Batedor central", pesoPorMetro: 0.26, linhaId: linha25.id },
    { codigo: "25.05", nome: "Contramarco", pesoPorMetro: 0.47, linhaId: linha25.id },
    { codigo: "25.06", nome: "Tubo 20x20", pesoPorMetro: 0.3, linhaId: linha25.id },
    { codigo: "BX.01", nome: "Perfil U de parede", pesoPorMetro: 0.45, linhaId: linhaBox.id },
    { codigo: "BX.02", nome: "Trilho de box", pesoPorMetro: 0.56, linhaId: linhaBox.id },
    { codigo: "BX.03", nome: "Perfil de acabamento do vidro", pesoPorMetro: 0.34, linhaId: linhaBox.id },
    { codigo: "30.01", nome: "Batente porta de abrir", pesoPorMetro: 0.89, linhaId: linhaAbrir.id },
    { codigo: "30.02", nome: "Folha porta de abrir", pesoPorMetro: 0.76, linhaId: linhaAbrir.id },
    { codigo: "30.03", nome: "Marco maxim-ar", pesoPorMetro: 0.44, linhaId: linhaAbrir.id },
    { codigo: "30.04", nome: "Folha maxim-ar", pesoPorMetro: 0.39, linhaId: linhaAbrir.id },
  ];
  const perfilPorCodigo: Record<string, string> = {};
  for (const p of perfis) {
    const criado = await prisma.perfil.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: p.codigo } },
      update: {},
      create: { ...p, empresaId: empresa.id, precoPorKgCentavos: PRECO_KG, comprimentoBarraMm: 6000 },
    });
    perfilPorCodigo[p.codigo] = criado.id;
  }

  const vidros = [
    { nome: "Incolor 4mm", tipo: "INCOLOR", espessuraMm: 4, precoM2Centavos: REAIS(95), m2Minimo: 0.5 },
    { nome: "Incolor 6mm", tipo: "INCOLOR", espessuraMm: 6, precoM2Centavos: REAIS(140), m2Minimo: 0.5 },
    { nome: "Verde 4mm", tipo: "VERDE", espessuraMm: 4, precoM2Centavos: REAIS(125), m2Minimo: 0.5 },
    { nome: "Fumê 4mm", tipo: "FUME", espessuraMm: 4, precoM2Centavos: REAIS(130), m2Minimo: 0.5 },
    { nome: "Temperado incolor 8mm", tipo: "INCOLOR", espessuraMm: 8, precoM2Centavos: REAIS(280), m2Minimo: 1, temperado: true },
    { nome: "Temperado verde 8mm", tipo: "VERDE", espessuraMm: 8, precoM2Centavos: REAIS(320), m2Minimo: 1, temperado: true },
    { nome: "Laminado incolor 6mm", tipo: "LAMINADO", espessuraMm: 6, precoM2Centavos: REAIS(240), m2Minimo: 0.5 },
    { nome: "Mini boreal 4mm", tipo: "FANTASIA", espessuraMm: 4, precoM2Centavos: REAIS(110), m2Minimo: 0.5 },
  ];
  const vidroPorNome: Record<string, string> = {};
  for (const v of vidros) {
    const criado = await prisma.vidro.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: v.nome } },
      update: {},
      create: { ...v, empresaId: empresa.id },
    });
    vidroPorNome[v.nome] = criado.id;
  }

  const ferragens = [
    { nome: "Roldana dupla", unidade: "pç", precoUnitarioCentavos: REAIS(8.5) },
    { nome: "Fecho concha", unidade: "pç", precoUnitarioCentavos: REAIS(12) },
    { nome: "Escova de vedação", unidade: "m", precoUnitarioCentavos: REAIS(3.2) },
    { nome: "Borracha de vedação", unidade: "m", precoUnitarioCentavos: REAIS(2.8) },
    { nome: "Silicone neutro", unidade: "tubo", precoUnitarioCentavos: REAIS(38) },
    { nome: "Parafuso 4,2x25", unidade: "pç", precoUnitarioCentavos: REAIS(0.25) },
    { nome: "Puxador tubular 30cm", unidade: "pç", precoUnitarioCentavos: REAIS(65) },
    { nome: "Dobradiça reforçada", unidade: "pç", precoUnitarioCentavos: REAIS(22) },
    { nome: "Fechadura de embutir", unidade: "pç", precoUnitarioCentavos: REAIS(95) },
    { nome: "Braço maxim-ar 40cm", unidade: "pç", precoUnitarioCentavos: REAIS(46) },
    { nome: "Kit box de correr", unidade: "kit", precoUnitarioCentavos: REAIS(180) },
    { nome: "Puxador de box", unidade: "pç", precoUnitarioCentavos: REAIS(42) },
  ];
  const ferragemPorNome: Record<string, string> = {};
  for (const f of ferragens) {
    const criado = await prisma.ferragem.upsert({
      where: { empresaId_nome: { empresaId: empresa.id, nome: f.nome } },
      update: {},
      create: { ...f, empresaId: empresa.id },
    });
    ferragemPorNome[f.nome] = criado.id;
  }

  // ── Tipologias ───────────────────────────────────────────────────────────
  type Modelo = {
    nome: string;
    categoria: CategoriaTipologia;
    linhaId: string;
    descricao: string;
    desenhoSvg: string;
    parametros: Array<{ chave: string; rotulo: string; valorPadrao: number }>;
    pecas: Array<{ perfil: string; descricao: string; corte: TipoCorte; qtd: string; comprimento: string }>;
    vidros: Array<{ vidro: string; descricao: string; qtd: string; largura: string; altura: string }>;
    ferragens: Array<{ ferragem: string; descricao: string; qtd: string }>;
    limites?: { larguraMinMm?: number; larguraMaxMm?: number; alturaMinMm?: number; alturaMaxMm?: number };
  };

  const moldura = (interno: string) =>
    `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="192" height="132" fill="none" stroke="currentColor" stroke-width="4"/>${interno}</svg>`;

  const modelos: Modelo[] = [
    {
      nome: "Janela 2 folhas de correr",
      categoria: "JANELA",
      linhaId: linha25.id,
      descricao: "Duas folhas móveis sobre trilho de 2 vias. A tipologia mais vendida do setor.",
      desenhoSvg: moldura(
        '<line x1="100" y1="4" x2="100" y2="136" stroke="currentColor" stroke-width="3"/><path d="M40 70 h30 M60 62 l10 8 -10 8" stroke="currentColor" stroke-width="3" fill="none"/><path d="M160 70 h-30 M140 62 l-10 8 10 8" stroke="currentColor" stroke-width="3" fill="none"/>',
      ),
      parametros: [
        { chave: "folga", rotulo: "Folga de montagem (mm)", valorPadrao: 10 },
        { chave: "transpasse", rotulo: "Transpasse entre folhas (mm)", valorPadrao: 30 },
        { chave: "folgaVidro", rotulo: "Folga do vidro (mm)", valorPadrao: 6 },
      ],
      pecas: [
        { perfil: "25.01", descricao: "Trilho superior e inferior", corte: "RETO", qtd: "2", comprimento: "L" },
        { perfil: "25.02", descricao: "Marco lateral", corte: "RETO", qtd: "2", comprimento: "H" },
        { perfil: "25.03", descricao: "Folha — vertical", corte: "ANGULO_45", qtd: "4", comprimento: "H - 60" },
        { perfil: "25.03", descricao: "Folha — horizontal", corte: "ANGULO_45", qtd: "4", comprimento: "(L + transpasse) / 2 - 30" },
        { perfil: "25.04", descricao: "Batedor central", corte: "RETO", qtd: "2", comprimento: "H - 60" },
      ],
      vidros: [
        {
          vidro: "Incolor 4mm",
          descricao: "Vidro da folha",
          qtd: "2",
          largura: "(L + transpasse) / 2 - 100 - folgaVidro",
          altura: "H - 130 - folgaVidro",
        },
      ],
      ferragens: [
        { ferragem: "Roldana dupla", descricao: "Roldanas (2 por folha)", qtd: "4" },
        { ferragem: "Fecho concha", descricao: "Fecho", qtd: "1" },
        { ferragem: "Escova de vedação", descricao: "Escova nas folhas", qtd: "teto(4 * H / 1000)" },
        { ferragem: "Borracha de vedação", descricao: "Borracha do vidro", qtd: "teto(2 * (L + 2 * H) / 1000)" },
        { ferragem: "Parafuso 4,2x25", descricao: "Parafusos de montagem", qtd: "24" },
      ],
    },
    {
      nome: "Janela 4 folhas de correr",
      categoria: "JANELA",
      linhaId: linha25.id,
      descricao: "Quatro folhas móveis. Para vãos largos, a partir de 1,80 m.",
      desenhoSvg: moldura(
        '<line x1="52" y1="4" x2="52" y2="136" stroke="currentColor" stroke-width="3"/><line x1="100" y1="4" x2="100" y2="136" stroke="currentColor" stroke-width="3"/><line x1="148" y1="4" x2="148" y2="136" stroke="currentColor" stroke-width="3"/>',
      ),
      parametros: [
        { chave: "folga", rotulo: "Folga de montagem (mm)", valorPadrao: 10 },
        { chave: "transpasse", rotulo: "Transpasse entre folhas (mm)", valorPadrao: 30 },
        { chave: "folgaVidro", rotulo: "Folga do vidro (mm)", valorPadrao: 6 },
      ],
      pecas: [
        { perfil: "25.01", descricao: "Trilho superior e inferior", corte: "RETO", qtd: "2", comprimento: "L" },
        { perfil: "25.02", descricao: "Marco lateral", corte: "RETO", qtd: "2", comprimento: "H" },
        { perfil: "25.03", descricao: "Folha — vertical", corte: "ANGULO_45", qtd: "8", comprimento: "H - 60" },
        { perfil: "25.03", descricao: "Folha — horizontal", corte: "ANGULO_45", qtd: "8", comprimento: "(L + 3 * transpasse) / 4 - 30" },
        { perfil: "25.04", descricao: "Batedor central", corte: "RETO", qtd: "4", comprimento: "H - 60" },
      ],
      vidros: [
        {
          vidro: "Incolor 4mm",
          descricao: "Vidro da folha",
          qtd: "4",
          largura: "(L + 3 * transpasse) / 4 - 100 - folgaVidro",
          altura: "H - 130 - folgaVidro",
        },
      ],
      ferragens: [
        { ferragem: "Roldana dupla", descricao: "Roldanas (2 por folha)", qtd: "8" },
        { ferragem: "Fecho concha", descricao: "Fechos", qtd: "2" },
        { ferragem: "Escova de vedação", descricao: "Escova nas folhas", qtd: "teto(8 * H / 1000)" },
        { ferragem: "Borracha de vedação", descricao: "Borracha do vidro", qtd: "teto(2 * (L + 4 * H) / 1000)" },
        { ferragem: "Parafuso 4,2x25", descricao: "Parafusos de montagem", qtd: "40" },
      ],
      limites: { larguraMinMm: 1500 },
    },
    {
      nome: "Porta de correr 2 folhas",
      categoria: "PORTA",
      linhaId: linha25.id,
      descricao: "Porta de correr com duas folhas e puxador.",
      desenhoSvg: moldura(
        '<line x1="100" y1="4" x2="100" y2="136" stroke="currentColor" stroke-width="3"/><circle cx="88" cy="70" r="4" fill="currentColor"/><circle cx="112" cy="70" r="4" fill="currentColor"/>',
      ),
      parametros: [
        { chave: "folga", rotulo: "Folga de montagem (mm)", valorPadrao: 10 },
        { chave: "transpasse", rotulo: "Transpasse entre folhas (mm)", valorPadrao: 40 },
        { chave: "folgaVidro", rotulo: "Folga do vidro (mm)", valorPadrao: 6 },
      ],
      pecas: [
        { perfil: "25.01", descricao: "Trilho superior e inferior", corte: "RETO", qtd: "2", comprimento: "L" },
        { perfil: "25.02", descricao: "Marco lateral", corte: "RETO", qtd: "2", comprimento: "H" },
        { perfil: "25.03", descricao: "Folha — vertical", corte: "ANGULO_45", qtd: "4", comprimento: "H - 50" },
        { perfil: "25.03", descricao: "Folha — horizontal", corte: "ANGULO_45", qtd: "4", comprimento: "(L + transpasse) / 2 - 30" },
        { perfil: "25.06", descricao: "Reforço da folha", corte: "RETO", qtd: "2", comprimento: "(L + transpasse) / 2 - 60" },
      ],
      vidros: [
        {
          vidro: "Incolor 6mm",
          descricao: "Vidro da folha",
          qtd: "2",
          largura: "(L + transpasse) / 2 - 100 - folgaVidro",
          altura: "H - 140 - folgaVidro",
        },
      ],
      ferragens: [
        { ferragem: "Roldana dupla", descricao: "Roldanas reforçadas", qtd: "4" },
        { ferragem: "Puxador tubular 30cm", descricao: "Puxador", qtd: "2" },
        { ferragem: "Fechadura de embutir", descricao: "Fechadura", qtd: "1" },
        { ferragem: "Escova de vedação", descricao: "Escova nas folhas", qtd: "teto(4 * H / 1000)" },
        { ferragem: "Parafuso 4,2x25", descricao: "Parafusos de montagem", qtd: "30" },
      ],
      limites: { alturaMinMm: 1800 },
    },
    {
      nome: "Maxim-ar 1 folha",
      categoria: "JANELA",
      linhaId: linhaAbrir.id,
      descricao: "Folha projetante sobre braços maxim-ar. Comum em banheiro e área de serviço.",
      desenhoSvg: moldura('<path d="M12 128 L188 96 L188 128 Z" fill="currentColor" opacity="0.15"/><line x1="12" y1="128" x2="188" y2="96" stroke="currentColor" stroke-width="3"/>'),
      parametros: [
        { chave: "folga", rotulo: "Folga de montagem (mm)", valorPadrao: 10 },
        { chave: "folgaVidro", rotulo: "Folga do vidro (mm)", valorPadrao: 6 },
      ],
      pecas: [
        { perfil: "30.03", descricao: "Marco — horizontal", corte: "ANGULO_45", qtd: "2", comprimento: "L" },
        { perfil: "30.03", descricao: "Marco — vertical", corte: "ANGULO_45", qtd: "2", comprimento: "H" },
        { perfil: "30.04", descricao: "Folha — horizontal", corte: "ANGULO_45", qtd: "2", comprimento: "L - 40" },
        { perfil: "30.04", descricao: "Folha — vertical", corte: "ANGULO_45", qtd: "2", comprimento: "H - 40" },
      ],
      vidros: [{ vidro: "Mini boreal 4mm", descricao: "Vidro da folha", qtd: "1", largura: "L - 90 - folgaVidro", altura: "H - 90 - folgaVidro" }],
      ferragens: [
        { ferragem: "Braço maxim-ar 40cm", descricao: "Braços", qtd: "2" },
        { ferragem: "Fecho concha", descricao: "Fecho", qtd: "1" },
        { ferragem: "Borracha de vedação", descricao: "Borracha do vidro", qtd: "teto(2 * (L + H) / 1000)" },
        { ferragem: "Parafuso 4,2x25", descricao: "Parafusos de montagem", qtd: "16" },
      ],
      limites: { larguraMaxMm: 1500, alturaMaxMm: 1200 },
    },
    {
      nome: "Porta de abrir 1 folha",
      categoria: "PORTA",
      linhaId: linhaAbrir.id,
      descricao: "Porta de abrir com batente, três dobradiças e fechadura de embutir.",
      desenhoSvg: moldura('<path d="M20 136 L20 4 L180 30 L180 136 Z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="168" cy="86" r="4" fill="currentColor"/>'),
      parametros: [
        { chave: "folga", rotulo: "Folga de montagem (mm)", valorPadrao: 10 },
        { chave: "folgaVidro", rotulo: "Folga do vidro (mm)", valorPadrao: 6 },
      ],
      pecas: [
        { perfil: "30.01", descricao: "Batente — vertical", corte: "ANGULO_45", qtd: "2", comprimento: "H" },
        { perfil: "30.01", descricao: "Batente — travessa superior", corte: "ANGULO_45", qtd: "1", comprimento: "L" },
        { perfil: "30.02", descricao: "Folha — vertical", corte: "ANGULO_45", qtd: "2", comprimento: "H - 20" },
        { perfil: "30.02", descricao: "Folha — horizontal", corte: "ANGULO_45", qtd: "2", comprimento: "L - 20" },
      ],
      vidros: [{ vidro: "Laminado incolor 6mm", descricao: "Vidro da folha", qtd: "1", largura: "L - 180 - folgaVidro", altura: "H - 180 - folgaVidro" }],
      ferragens: [
        { ferragem: "Dobradiça reforçada", descricao: "Dobradiças", qtd: "se(H > 2100, 4, 3)" },
        { ferragem: "Fechadura de embutir", descricao: "Fechadura", qtd: "1" },
        { ferragem: "Puxador tubular 30cm", descricao: "Puxador", qtd: "1" },
        { ferragem: "Silicone neutro", descricao: "Silicone", qtd: "1" },
        { ferragem: "Parafuso 4,2x25", descricao: "Parafusos de montagem", qtd: "24" },
      ],
      limites: { alturaMinMm: 1800 },
    },
    {
      nome: "Box frontal 2 folhas",
      categoria: "BOX",
      linhaId: linhaBox.id,
      descricao: "Box de correr em vidro temperado 8mm, duas folhas sobre trilho.",
      desenhoSvg: moldura('<line x1="100" y1="4" x2="100" y2="136" stroke="currentColor" stroke-width="3"/><rect x="10" y="10" width="84" height="120" fill="currentColor" opacity="0.08"/><rect x="106" y="10" width="84" height="120" fill="currentColor" opacity="0.15"/>'),
      parametros: [
        { chave: "transpasse", rotulo: "Transpasse entre folhas (mm)", valorPadrao: 50 },
        { chave: "folgaPiso", rotulo: "Folga do piso (mm)", valorPadrao: 15 },
      ],
      pecas: [
        { perfil: "BX.02", descricao: "Trilho superior", corte: "RETO", qtd: "1", comprimento: "L" },
        { perfil: "BX.01", descricao: "Perfil U de parede", corte: "RETO", qtd: "2", comprimento: "H" },
        { perfil: "BX.03", descricao: "Acabamento do vidro", corte: "RETO", qtd: "2", comprimento: "(L + transpasse) / 2" },
      ],
      vidros: [
        {
          vidro: "Temperado incolor 8mm",
          descricao: "Folha de temperado",
          qtd: "2",
          largura: "(L + transpasse) / 2 - 10",
          altura: "H - folgaPiso - 40",
        },
      ],
      ferragens: [
        { ferragem: "Kit box de correr", descricao: "Kit de roldanas e guias", qtd: "1" },
        { ferragem: "Puxador de box", descricao: "Puxadores", qtd: "2" },
        { ferragem: "Silicone neutro", descricao: "Silicone", qtd: "1" },
      ],
      limites: { larguraMaxMm: 2000, alturaMaxMm: 2200 },
    },
  ];

  for (const modelo of modelos) {
    const existente = await prisma.tipologia.findUnique({
      where: { empresaId_nome: { empresaId: empresa.id, nome: modelo.nome } },
    });
    // Não sobrescreve: se a serralheria já ajustou as fórmulas dela, rodar o
    // seed de novo não pode desfazer o trabalho.
    if (existente) continue;

    await prisma.tipologia.create({
      data: {
        empresaId: empresa.id,
        linhaId: modelo.linhaId,
        nome: modelo.nome,
        categoria: modelo.categoria,
        descricao: modelo.descricao,
        desenhoSvg: modelo.desenhoSvg,
        ...modelo.limites,
        parametros: { create: modelo.parametros.map((p, i) => ({ ...p, ordem: i })) },
        pecas: {
          create: modelo.pecas.map((p, i) => ({
            perfilId: perfilPorCodigo[p.perfil],
            descricao: p.descricao,
            corte: p.corte,
            formulaQuantidade: p.qtd,
            formulaComprimento: p.comprimento,
            ordem: i,
          })),
        },
        vidros: {
          create: modelo.vidros.map((v, i) => ({
            vidroId: vidroPorNome[v.vidro],
            descricao: v.descricao,
            formulaQuantidade: v.qtd,
            formulaLargura: v.largura,
            formulaAltura: v.altura,
            ordem: i,
          })),
        },
        ferragens: {
          create: modelo.ferragens.map((f, i) => ({
            ferragemId: ferragemPorNome[f.ferragem],
            descricao: f.descricao,
            formulaQuantidade: f.qtd,
            ordem: i,
          })),
        },
      },
    });
  }

  // ── Clientes de exemplo ──────────────────────────────────────────────────
  const clientes = [
    { nome: "Construtora Horizonte", tipo: "JURIDICA" as const, documento: "12345678000199", cidade: "São Paulo", uf: "SP", telefone: "(11) 3333-1000" },
    { nome: "Maria Aparecida Souza", tipo: "FISICA" as const, documento: "12345678901", cidade: "Guarulhos", uf: "SP", telefone: "(11) 98888-2020" },
    { nome: "Condomínio Vila Nova", tipo: "JURIDICA" as const, documento: "98765432000155", cidade: "Osasco", uf: "SP", telefone: "(11) 4004-3030" },
  ];
  for (const c of clientes) {
    await prisma.cliente.upsert({
      where: { empresaId_documento: { empresaId: empresa.id, documento: c.documento } },
      update: {},
      create: { ...c, empresaId: empresa.id },
    });
  }

  const total = await prisma.tipologia.count({ where: { empresaId: empresa.id } });
  console.log(`✔ Empresa "${empresa.nome}" pronta — ${perfis.length} perfis, ${vidros.length} vidros, ${ferragens.length} ferragens, ${total} tipologias.`);
  console.log("  Login: dono@vidracariamodelo.com.br / troque-esta-senha");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
