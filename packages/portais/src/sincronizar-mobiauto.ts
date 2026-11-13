import { prisma } from "@dilon-zap/db";
import { decidir, deveEstarNoAr, hashDoAnuncio, proximaTentativa } from "./decisao";
import { cifrar, decifrar } from "./seguranca";
import { linkDaFotoParaPortal, type OpcoesCiclo, type ResumoCiclo } from "./sincronizar";
import { catalogoMobiCompleto, novosCatalogosMobi, resolverCatalogoMobiauto } from "./mobiauto/catalogo";
import { ErroMobiauto, SessaoMobiauto, appMobiautoDoAmbiente, type AppMobiauto, type DealExistente, type TokensMobiauto } from "./mobiauto/cliente";
import { montarDealMobiauto, type CatalogoMobiauto } from "./mobiauto/mapa";

/**
 * Sincronização do estoque com a MobiAuto (Mobigestor). Como a Webmotors, responde na hora,
 * carro a carro: cria/atualiza o deal, troca as fotos e publica no plano escolhido. Mesmas
 * regras de decisão (decisao.ts): disponível e marcado publica; mudou, atualiza; vendido sai
 * (e o deal é apagado); reservado só sai do ar (o deal fica, para voltar depressa).
 * Regra da gestão: carro sem km informada não é publicado.
 */

const MAX_POR_RODADA = 30;
const MAX_FOTOS = 20;

/** O que fica guardado (cifrado) na conta: loja na MobiAuto e os tokens do OAuth. */
export type ContaMobiauto = { dealerId: string; access: string; refresh: string; expiraEm: number };
export const contaMobiautoGuardada = (guardado: string, chave: Buffer): ContaMobiauto => JSON.parse(decifrar(guardado, chave)) as ContaMobiauto;
export const guardarContaMobiauto = (c: ContaMobiauto, chave: Buffer) => cifrar(JSON.stringify(c), chave);

type Guardado = Partial<CatalogoMobiauto> & { publicadoMobi?: boolean };

export type CriarSessaoMobiauto = (c: ContaMobiauto, app: AppMobiauto, aoRenovar: (t: TokensMobiauto) => Promise<void>) => SessaoMobiauto;
const sessaoPadrao: CriarSessaoMobiauto = (c, app, aoRenovar) => new SessaoMobiauto({ access: c.access, refresh: c.refresh, expiraEm: c.expiraEm }, c.dealerId, app, aoRenovar);

export async function cicloMobiauto(op: OpcoesCiclo, criarSessao: CriarSessaoMobiauto = sessaoPadrao): Promise<ResumoCiclo> {
  const resumo: ResumoCiclo = { lojas: 0, enviados: 0, removidos: 0, conferidos: 0, erros: 0 };
  const app = appMobiautoDoAmbiente(op.urlBase);
  if (!app) return resumo;
  const contas = await prisma.portalConta.findMany({ where: { portal: "MOBIAUTO", status: "CONECTADA" } });
  for (const conta of contas) {
    resumo.lojas++;
    try {
      const guardada = contaMobiautoGuardada(conta.accessTokenCripto, op.chave);
      const aoRenovar = async (t: TokensMobiauto) => {
        await prisma.portalConta.update({ where: { id: conta.id }, data: { accessTokenCripto: guardarContaMobiauto({ ...guardada, access: t.access, refresh: t.refresh, expiraEm: t.expiraEm }, op.chave) } });
      };
      const r = await sincronizarLoja(conta.tenantId, conta.id, conta.planoPadrao, criarSessao(guardada, app, aoRenovar), op);
      resumo.enviados += r.enviados;
      resumo.removidos += r.removidos;
      resumo.erros += r.erros;
    } catch (e) {
      resumo.erros++;
      const msg = e instanceof Error ? e.message : String(e);
      const recusada = e instanceof ErroMobiauto && e.semPermissao;
      await prisma.portalConta.update({ where: { id: conta.id }, data: { erro: msg.slice(0, 500), ...(recusada ? { status: "ERRO" } : {}) } });
    }
  }
  return resumo;
}

async function sincronizarLoja(tenantId: string, contaId: string, planoPadrao: string | null, sessao: SessaoMobiauto, op: OpcoesCiclo) {
  const agora = op.agora ?? new Date();
  const r = { enviados: 0, removidos: 0, erros: 0 };
  const pubs = await prisma.publicacaoPortal.findMany({
    where: { tenantId, portal: "MOBIAUTO", status: { notIn: ["ENVIADO", "REMOVENDO"] } },
    include: { veiculo: { include: { fotos: { orderBy: { ordem: "asc" }, select: { id: true } } } } },
  });
  const cache = novosCatalogosMobi();
  let feitas = 0;
  let localidade: number | null | undefined;
  const localidadeDaLoja = async () => (localidade === undefined ? (localidade = (await sessao.localidades().catch(() => []))[0] ?? null) : localidade);
  let existentes: Map<string, DealExistente> | null = null;
  const existentePorPlaca = async (placa: string | null): Promise<DealExistente | null> => {
    const chave = (placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (chave.length < 7) return null;
    if (!existentes) existentes = new Map((await sessao.estoque()).filter((d) => d.placa).map((d) => [d.placa, d]));
    return existentes.get(chave) ?? null;
  };

  for (const p of pubs) {
    if (feitas >= MAX_POR_RODADA) break;
    const v = p.veiculo;
    const noAr = deveEstarNoAr(v.status, p.ativo);
    const fotos = v.fotos.map((f) => linkDaFotoParaPortal(op.urlBase, f.id, op.segredoFotos)).slice(0, MAX_FOTOS);
    const hashFotos = hashDoAnuncio(fotos);
    const plano = p.plano ?? planoPadrao;
    let catalogo = ((p.catalogo as Guardado | null) ?? {}) as Guardado;
    let pendencias: string[] = [];

    if (noAr && !catalogoMobiCompleto(catalogo)) {
      const res = await resolverCatalogoMobiauto(sessao, v, cache);
      catalogo = { ...res.catalogo, ...Object.fromEntries(Object.entries(catalogo).filter(([, val]) => val)) };
      pendencias = res.pendencias;
    }
    if (noAr && catalogoMobiCompleto(catalogo) && !catalogo.localidade) {
      const l = await localidadeDaLoja();
      if (l) catalogo = { ...catalogo, localidade: l };
    }
    const carro = { ...v, opcionais: v.opcionais, fotos };
    const mapa = montarDealMobiauto(carro, catalogoMobiCompleto(catalogo) ? catalogo : null, plano);
    const hash = mapa.ok ? hashDoAnuncio({ ...mapa.deal, fotos: hashFotos, plano }) : null;
    const acao = decidir(p, noAr, hash, agora);

    try {
      if (acao === "descartar") {
        await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", erro: null, proximaTentativaEm: null } });
      } else if (acao === "bloqueado" && !mapa.ok) {
        const faltas = pendencias.length ? [...pendencias, ...mapa.faltando.filter((f) => !f.startsWith("Escolher marca, modelo"))] : mapa.faltando;
        const erro = `Falta para anunciar: ${faltas.join("; ")}`;
        if (p.erro !== erro || JSON.stringify(p.catalogo) !== JSON.stringify(catalogo)) await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { erro, catalogo: catalogo as object } });
      } else if (acao === "enviar" && mapa.ok) {
        feitas++;
        let id = p.idExterno ? Number(p.idExterno) : null;
        let publicado = catalogo.publicadoMobi === true;
        if (!id) {
          // Antes de criar, vê se a MobiAuto já tem este carro (mesma placa): adota o deal, sem duplicar.
          const ja = await existentePorPlaca(v.placa);
          if (ja) {
            id = ja.id;
            publicado = ja.publicado;
            await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { idExterno: String(id) } });
            await sessao.atualizar(id, mapa.deal);
          } else {
            id = await sessao.criar(mapa.deal);
            // Grava o código na hora: se as fotos falharem, o próximo ciclo atualiza em vez de criar de novo.
            await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { idExterno: String(id) } });
          }
        } else {
          await sessao.atualizar(id, mapa.deal);
        }
        if (hashFotos !== p.hashFotos) await sincronizarFotos(sessao, id, fotos);
        if (!publicado) {
          await sessao.publicar(id, plano!);
          publicado = true;
        }
        await prisma.publicacaoPortal.update({
          where: { id: p.id },
          data: { status: "PUBLICADO", idExterno: String(id), hashEnviado: hash, hashFotos, erro: null, tentativas: 0, proximaTentativaEm: null, enviadoEm: agora, catalogo: { ...catalogo, publicadoMobi: publicado } as object },
        });
        r.enviados++;
      } else if (acao === "remover" && p.idExterno) {
        feitas++;
        const id = Number(p.idExterno);
        const saiuDeVez = v.status === "VENDIDO" || v.status === "DEVOLVIDO" || !p.ativo;
        if (catalogo.publicadoMobi !== false) await sessao.despublicar(id).catch((e) => { if (!(e instanceof ErroMobiauto) || e.http === 401 || e.http === 403 || !e.http) throw e; });
        if (saiuDeVez) {
          await sessao.excluir(id);
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", idExterno: null, hashEnviado: null, hashFotos: null, erro: null, tentativas: 0, proximaTentativaEm: null, catalogo: { ...catalogo, publicadoMobi: false } as object } });
        } else {
          // Reservado: o deal fica; quando voltar a estar disponível, só atualiza e publica de novo.
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", hashEnviado: null, erro: null, tentativas: 0, proximaTentativaEm: null, catalogo: { ...catalogo, publicadoMobi: false } as object } });
        }
        r.removidos++;
      } else if (acao === "remover") {
        await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", erro: null } });
      }
    } catch (e) {
      // MobiAuto fora do ar ou acesso recusado: vale para a loja toda, não só para este carro.
      if (e instanceof ErroMobiauto && (!e.http || e.semPermissao)) throw e;
      r.erros++;
      await prisma.publicacaoPortal.update({
        where: { id: p.id },
        data: { status: "ERRO", erro: (e instanceof Error ? e.message : String(e)).slice(0, 1000), ...(hash ? { hashEnviado: hash } : {}), catalogo: catalogo as object, tentativas: { increment: 1 }, proximaTentativaEm: proximaTentativa(p.tentativas + 1, agora) },
      });
    }
  }
  await prisma.portalConta.update({ where: { id: contaId }, data: { erro: null } });
  return r;
}

/** Deixa na MobiAuto exatamente as fotos da ficha, na ordem: apaga as de lá e envia de novo (a capa é a primeira). */
async function sincronizarFotos(sessao: SessaoMobiauto, id: number, fotos: string[]) {
  for (const f of await sessao.fotos(id)) await sessao.excluirFoto(id, f.id);
  await sessao.adicionarFotos(id, fotos);
}
