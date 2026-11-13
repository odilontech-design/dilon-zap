import { prisma } from "@dilon-zap/db";
import { buscarPagina, ErroPagina } from "@/lib/buscar-pagina";
import { enderecoDoSite, lerDetalheDoSite, lerListaDoSite, type CardDoSite } from "@/lib/importar-site";
import { patioDoPlano, registrarEvento } from "@/lib/veiculos";

/**
 * Traz o estoque do site atual da loja (hoje: layout do AutoCerto) para o
 * Zap. Em dois tempos, como a planilha: `simular` mostra o que entraria,
 * gravar cria os carros.
 *
 * Os carros entram EM PREPARAÇÃO, fora da vitrine: o site costuma não
 * publicar preço ("Sob Consulta"), quilometragem nem placa, e um carro sem
 * isso não pode ir ao ar (a ficha só libera "Pronto para vender" com preço e
 * km informados). As fotos ficam na fila de download, igual à planilha.
 */

export class ErroImportacaoSite extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type Buscador = (url: string) => Promise<{ html: string; urlFinal: string }>;

export type ResultadoSite = {
  site: string;
  encontrados: number;
  entram: number;
  jaNoEstoque: number;
  alemDoPlano: number;
  criados: number;
  semPreco: number;
  semKm: number;
  fotos: number;
  /** Páginas de carro que não abriram: o carro entra sem fotos e sem opcionais. */
  semDetalhe: number;
  previa: { nome: string; ano: string; cor: string | null; precoCents: number; kmInformado: boolean }[];
};

const MAX_CARROS = 300;

async function emParalelo<T, R>(itens: T[], limite: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (i < itens.length) {
        const atual = i++;
        saida[atual] = await fn(itens[atual]);
      }
    }),
  );
  return saida;
}

const nomeDoCard = (c: CardDoSite) => `${c.marca} ${c.modelo}${c.versao ? ` ${c.versao}` : ""}`;

export async function lerEstoqueDoSite(endereco: string, buscar: Buscador): Promise<{ cards: CardDoSite[]; base: URL }> {
  const url = enderecoDoSite(endereco);
  if (!url) throw new ErroImportacaoSite("endereço do site inválido: use algo como www.sualoja.com.br");
  // O que a pessoa digitou primeiro; se não for a lista, a página de veículos do AutoCerto.
  const tentativas = [...new Set([url.toString(), new URL("/Veiculos", url).toString()])];
  let ultimoErro = "";
  let abriuSemCarros = false;
  for (const t of tentativas) {
    try {
      const { html, urlFinal } = await buscar(t);
      const { cards } = lerListaDoSite(html, urlFinal);
      if (cards.length) return { cards: cards.slice(0, MAX_CARROS), base: new URL(urlFinal) };
      ultimoErro = "não achei carros nessa página";
      abriuSemCarros = true;
    } catch (e) {
      ultimoErro = e instanceof ErroPagina ? e.message : "falha ao ler o site";
    }
  }
  // O aviso de "só AutoCerto" só faz sentido quando o site abriu e não tinha carros; se ele não respondeu, o problema é outro.
  throw new ErroImportacaoSite(abriuSemCarros ? `${ultimoErro}. Por enquanto a importação lê sites feitos no AutoCerto; para outros sites, use a planilha.` : ultimoErro, 422);
}

/** Guarda de onde veio o estoque, para o espelho do site poder voltar lá depois. */
async function guardarSiteDeOrigem(tenantId: string, base: URL) {
  await prisma.veiculosConfig.upsert({ where: { tenantId }, create: { tenantId, siteOrigemUrl: base.origin }, update: { siteOrigemUrl: base.origin } });
}

export async function importarDoSite(input: {
  tenantId: string;
  /** Nulo quando quem importa é o agendamento (o histórico do carro fica sem autor). */
  userId: string | null;
  endereco: string;
  simular: boolean;
  buscar?: Buscador;
}): Promise<ResultadoSite> {
  const buscar = input.buscar ?? ((u) => buscarPagina(u));
  const { cards, base } = await lerEstoqueDoSite(input.endereco, buscar);

  // Quem já veio deste site (em qualquer situação, inclusive vendido) não entra de novo.
  const ja = new Set(
    (await prisma.veiculo.findMany({ where: { tenantId: input.tenantId, siteOrigemId: { in: cards.map((c) => c.siteId) } }, select: { siteOrigemId: true } })).map((v) => v.siteOrigemId),
  );
  let novos = cards.filter((c) => !ja.has(c.siteId));
  const jaNoEstoque = cards.length - novos.length;

  const patio = await patioDoPlano(prisma, input.tenantId);
  let alemDoPlano = 0;
  if (patio.vagas !== null && novos.length > patio.vagas) {
    alemDoPlano = novos.length - patio.vagas;
    novos = novos.slice(0, patio.vagas);
  }

  const resumo: ResultadoSite = {
    site: base.host,
    encontrados: cards.length,
    entram: novos.length,
    jaNoEstoque,
    alemDoPlano,
    criados: 0,
    semPreco: novos.filter((c) => c.precoCents <= 0).length,
    semKm: novos.filter((c) => !c.kmInformado).length,
    fotos: 0,
    semDetalhe: 0,
    previa: novos.slice(0, 8).map((c) => ({
      nome: nomeDoCard(c),
      ano: c.anoFabricacao === c.anoModelo ? String(c.anoModelo) : `${c.anoFabricacao}/${c.anoModelo}`,
      cor: c.cor,
      precoCents: c.precoCents,
      kmInformado: c.kmInformado,
    })),
  };
  if (input.simular || !novos.length) {
    if (!input.simular) await guardarSiteDeOrigem(input.tenantId, base);
    return resumo;
  }
  await guardarSiteDeOrigem(input.tenantId, base);

  // Páginas dos carros: 5 por vez, com tolerância (uma que não abre não derruba as outras).
  const detalhes = await emParalelo(novos, 5, async (c) => {
    try {
      const { html, urlFinal } = await buscar(c.urlDetalhe);
      return lerDetalheDoSite(html, urlFinal);
    } catch {
      return null;
    }
  });

  for (let i = 0; i < novos.length; i++) {
    const c = novos[i];
    const d = detalhes[i];
    const fotos = d?.fotos.length ? d.fotos : c.capa ? [c.capa] : [];
    if (!d) resumo.semDetalhe++;
    resumo.fotos += fotos.length;
    await prisma.$transaction(async (tx) => {
      const v = await tx.veiculo.create({
        data: {
          tenantId: input.tenantId,
          tipo: "CARRO",
          marca: c.marca,
          modelo: c.modelo,
          versao: c.versao,
          anoFabricacao: c.anoFabricacao,
          anoModelo: c.anoModelo,
          km: c.km,
          kmInformado: c.kmInformado,
          cor: c.cor,
          cambio: c.cambio,
          combustivel: c.combustivel,
          opcionais: d?.opcionais ?? [],
          precoCents: c.precoCents,
          origem: "COMPRA",
          status: "PREPARACAO",
          siteOrigemId: c.siteId,
          fotosParaImportar: fotos,
        },
        select: { id: true },
      });
      const faltas = [c.precoCents <= 0 && "preço", !c.kmInformado && "quilometragem", "placa"].filter(Boolean).join(", ");
      await registrarEvento(
        tx,
        v.id,
        "entrada",
        `Importado do site ${base.host}${fotos.length ? `, ${fotos.length} foto(s) a baixar` : ""}${d ? "" : " (a página do carro não abriu: sem fotos e opcionais completos)"}. Falta informar: ${faltas}.`,
        input.userId,
      );
    });
    resumo.criados++;
  }
  return resumo;
}
