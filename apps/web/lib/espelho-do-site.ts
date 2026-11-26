import { prisma } from "@dilon-zap/db";
import { importarDoSite, lerEstoqueDoSite, type Buscador, ErroImportacaoSite } from "@/lib/importar-site-estoque";
import { buscarPagina } from "@/lib/buscar-pagina";
import { registrarEvento } from "@/lib/veiculos";
import { STATUS_NO_PATIO } from "@/lib/veiculos-regras";

/**
 * Espelho do site atual da loja. Enquanto o site antigo (AutoCerto etc.) for o
 * cadastro principal do estoque, o Zap o acompanha:
 *
 *   - carro NOVO no site → entra no Zap em preparação (com fotos e opcionais);
 *   - carro que SAIU do site → é escondido da vitrine do Zap na hora e fica
 *     marcado para a gestão confirmar (provavelmente foi vendido lá). Nunca é
 *     vendido nem apagado sozinho: uma venda tem comprador, valor e dinheiro;
 *   - carro que VOLTOU ao site → volta para a vitrine.
 *
 * Trava de segurança: um site fora do ar, em manutenção ou com o layout mudado
 * pode parecer "vazio". Se sumir carro demais de uma vez, nada é escondido e o
 * resumo avisa para conferir.
 */

/** Passou disso (e de MIN), é mais provável o site ter mudado do que a loja vender tudo. */
const FRACAO_MAXIMA_DE_SUMIDOS = 0.3;
const MINIMO_PARA_TRAVAR = 5;

export type ResultadoEspelho = {
  site: string;
  noSite: number;
  novos: number;
  sumiram: number;
  voltaram: number;
  /** Sumiu carro demais de uma vez: nada foi escondido. */
  travado: boolean;
  resumo: string;
};

export async function sincronizarComSite(input: { tenantId: string; userId: string | null; buscar?: Buscador }): Promise<ResultadoEspelho> {
  const cfg = await prisma.veiculosConfig.findUnique({ where: { tenantId: input.tenantId }, select: { siteOrigemUrl: true } });
  if (!cfg?.siteOrigemUrl) throw new ErroImportacaoSite("esta loja ainda não importou o estoque de um site: use Veículos → Importar primeiro");
  const buscar = input.buscar ?? ((u) => buscarPagina(u));

  // 1) O que o site mostra agora. Falha de leitura é erro, nunca "estoque vazio".
  const { cards, base } = await lerEstoqueDoSite(cfg.siteOrigemUrl, buscar);
  const noSite = new Set(cards.map((c) => c.siteId));

  // 2) Carros novos: o mesmo caminho da importação (fotos, opcionais, limite do plano, sem duplicar).
  const novos = await importarDoSite({ tenantId: input.tenantId, userId: input.userId, endereco: cfg.siteOrigemUrl, simular: false, buscar });

  // 3) Quem veio do site e está no pátio: sumiu ou voltou?
  const rastreados = await prisma.veiculo.findMany({
    where: { tenantId: input.tenantId, siteOrigemId: { not: null }, seguirSite: true, status: { in: STATUS_NO_PATIO } },
    select: { id: true, siteOrigemId: true, sumiuDoSiteEm: true, naVitrine: true },
  });
  const sumindo = rastreados.filter((v) => !noSite.has(v.siteOrigemId!) && !v.sumiuDoSiteEm);
  const voltando = rastreados.filter((v) => noSite.has(v.siteOrigemId!) && v.sumiuDoSiteEm);

  const demais = sumindo.length >= MINIMO_PARA_TRAVAR && sumindo.length > rastreados.length * FRACAO_MAXIMA_DE_SUMIDOS;
  const agora = new Date();
  if (!demais) {
    for (const v of sumindo) {
      await prisma.$transaction(async (tx) => {
        await tx.veiculo.update({ where: { id: v.id }, data: { sumiuDoSiteEm: agora, naVitrine: false } });
        await registrarEvento(tx, v.id, "site", `Saiu do site ${base.host}: escondido da vitrine. Confirme se foi vendido (registre a venda) ou reative.`, input.userId);
      });
    }
  }
  for (const v of voltando) {
    await prisma.$transaction(async (tx) => {
      await tx.veiculo.update({ where: { id: v.id }, data: { sumiuDoSiteEm: null, naVitrine: true } });
      await registrarEvento(tx, v.id, "site", `Voltou ao site ${base.host}: de volta à vitrine.`, input.userId);
    });
  }

  const r: ResultadoEspelho = {
    site: base.host,
    noSite: cards.length,
    novos: novos.criados,
    sumiram: demais ? 0 : sumindo.length,
    voltaram: voltando.length,
    travado: demais,
    resumo: "",
  };
  r.resumo = [
    `${r.noSite} no site`,
    r.novos ? `${r.novos} novo(s)` : null,
    r.sumiram ? `${r.sumiram} saiu(ram) do site e foi(ram) escondido(s) da vitrine` : null,
    r.voltaram ? `${r.voltaram} voltou(aram)` : null,
    demais ? `ATENÇÃO: ${sumindo.length} carros sumiram de uma vez; nada foi escondido. Confira se o site mudou` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  await prisma.veiculosConfig.update({ where: { tenantId: input.tenantId }, data: { siteSincEm: agora, siteSincResumo: r.resumo } });
  return r;
}

/** Os carros da loja que esperam confirmação por terem saído do site (os mais recentes primeiro). */
export async function pendentesDeConfirmacao(tenantId: string) {
  const carros = await prisma.veiculo.findMany({
    where: { tenantId, sumiuDoSiteEm: { not: null }, status: { in: STATUS_NO_PATIO } },
    orderBy: { sumiuDoSiteEm: "desc" },
    take: 100,
    select: { id: true, marca: true, modelo: true, versao: true, anoModelo: true, sumiuDoSiteEm: true, status: true, origem: true },
  });
  return carros.map((c) => ({ ...c, motivoSemBaixa: motivoSemBaixaEmLote(c) }));
}

/** O agendamento não conseguiu ler o site: a gestão vê o motivo na tela, em vez de achar que está tudo em dia. */
export async function registrarFalhaDoEspelho(tenantId: string, erro: string) {
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  await prisma.veiculosConfig.updateMany({ where: { tenantId }, data: { siteSincResumo: `Falhou em ${quando}: ${erro}`.slice(0, 500) } });
}

/** A gestão diz "foi engano, o carro continua à venda": volta para a vitrine e para de ser acompanhado como sumido. */
export async function reativarCarroDoSite(tenantId: string, veiculoId: string, userId: string): Promise<boolean> {
  const v = await prisma.veiculo.findFirst({ where: { id: veiculoId, tenantId, sumiuDoSiteEm: { not: null } }, select: { id: true } });
  if (!v) return false;
  await prisma.$transaction(async (tx) => {
    // seguirSite=false: não é escondido de novo no próximo ciclo. O siteOrigemId fica, para o importador não duplicá-lo se o carro reaparecer no site.
    await tx.veiculo.update({ where: { id: v.id }, data: { sumiuDoSiteEm: null, naVitrine: true, seguirSite: false } });
    await registrarEvento(tx, v.id, "site", "Reativado pela gestão: continua à venda e não é mais comparado com o site antigo.", userId);
  });
  return true;
}

/** Todas as lojas com espelho ligado (para o agendamento). */
export async function lojasComEspelho(): Promise<string[]> {
  const cfgs = await prisma.veiculosConfig.findMany({ where: { siteOrigemUrl: { not: null } }, select: { tenantId: true } });
  return cfgs.map((c) => c.tenantId);
}

/**
 * Por que um carro que saiu do site NÃO pode ser baixado em lote (null = pode). Em lote só entra o
 * carro à venda ou em preparação e que não é consignado: o reservado tem sinal e cliente a resolver, e o
 * consignado gera repasse ao dono, que só a venda pela ficha cria.
 */
export function motivoSemBaixaEmLote(v: { status: string; origem: string; sumiuDoSiteEm: Date | string | null }): string | null {
  if (!v.sumiuDoSiteEm) return "não está marcado como fora do site";
  if (v.status === "VENDIDO" || v.status === "DEVOLVIDO") return "já saiu do estoque";
  if (v.status === "RESERVADO") return "está reservado: conclua ou cancele a reserva pela ficha";
  if (v.origem === "CONSIGNACAO") return "é consignado: registre a venda pela ficha para gerar o repasse ao dono";
  return null;
}

/**
 * "Baixar do estoque" vários carros que saíram do site de uma vez: ficam VENDIDOS (saem do pátio, da vitrine
 * e, pelo worker, dos portais). Não cria a venda no financeiro (comprador, valor e forma de pagamento): isso
 * continua pela ficha ou pela planilha de controle de vendas. A data de saída é a em que o carro sumiu do site.
 */
export async function baixarEmLote(input: { tenantId: string; userId: string; ids: string[] }): Promise<{ baixados: number; ignorados: { id: string; nome: string; motivo: string }[] }> {
  const ids = [...new Set(input.ids)].slice(0, 100);
  const carros = await prisma.veiculo.findMany({
    where: { tenantId: input.tenantId, id: { in: ids } },
    select: { id: true, marca: true, modelo: true, anoModelo: true, status: true, origem: true, sumiuDoSiteEm: true },
  });
  const ignorados: { id: string; nome: string; motivo: string }[] = [];
  let baixados = 0;
  const achados = new Set(carros.map((c) => c.id));
  for (const id of ids) if (!achados.has(id)) ignorados.push({ id, nome: "carro não encontrado", motivo: "não é desta loja" });
  for (const c of carros) {
    const motivo = motivoSemBaixaEmLote(c);
    if (motivo) {
      ignorados.push({ id: c.id, nome: `${c.marca} ${c.modelo} ${c.anoModelo}`, motivo });
      continue;
    }
    await prisma.$transaction(async (tx) => {
      // Só baixa se ainda estiver como estava (outra pessoa pode ter mexido no carro enquanto a lista estava aberta).
      const r = await tx.veiculo.updateMany({
        where: { id: c.id, tenantId: input.tenantId, status: c.status, sumiuDoSiteEm: { not: null } },
        data: { status: "VENDIDO", statusDesde: new Date(), saidaEm: c.sumiuDoSiteEm ?? new Date(), naVitrine: false },
      });
      if (r.count !== 1) return;
      await registrarEvento(tx, c.id, "saida", "Baixado do estoque em lote: saiu do site antigo. A venda (comprador e valor) não foi registrada aqui.", input.userId);
      baixados++;
    });
  }
  return { baixados, ignorados };
}

/** "Foi engano" em vários carros de uma vez: voltam para a vitrine e deixam de ser comparados com o site antigo. */
export async function reativarEmLote(input: { tenantId: string; userId: string; ids: string[] }): Promise<{ reativados: number }> {
  let reativados = 0;
  for (const id of [...new Set(input.ids)].slice(0, 100)) if (await reativarCarroDoSite(input.tenantId, id, input.userId)) reativados++;
  return { reativados };
}
