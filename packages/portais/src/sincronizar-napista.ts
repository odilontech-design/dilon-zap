import { paraOPortal } from "./ajustes";
import { prisma } from "@dilon-zap/db";
import { decidir, deveEstarNoAr, hashDoAnuncio, proximaTentativa } from "./decisao";
import { cifrar, decifrar } from "./seguranca";
import { linkDaFotoParaPortal, type OpcoesCiclo, type ResumoCiclo } from "./sincronizar";
import { novosCatalogosNapista, resolverCatalogoNapista, type CatalogoNapista } from "./napista/catalogo";
import { ErroNapista, SessaoNapista, appNapistaDoAmbiente, type AppNapista, type OfertaExistente, type TokensNapista } from "./napista/cliente";
import { montarOfertaNapista } from "./napista/mapa";

/**
 * Sincronização do estoque com o NaPista. Responde na hora, carro a carro: cria ou atualiza o
 * anúncio (offer), troca as fotos por endereço e ajusta o status. Mesmas regras de decisão das
 * outras integrações (decisao.ts). Reservado: fica UNPUBLISHED (volta rápido). Vendido: SOLD.
 * Devolvido ou desligado pela loja: anúncio apagado. Carro sem km informada não é publicado.
 */

const MAX_POR_RODADA = 30;
const MAX_FOTOS = 20;

/** O que fica guardado (cifrado) na conta: a loja no NaPista e os tokens do OAuth. */
export type ContaNapista = { sellerId: string; access: string; refresh: string; expiraEm: number };
export const contaNapistaGuardada = (guardado: string, chave: Buffer): ContaNapista => JSON.parse(decifrar(guardado, chave)) as ContaNapista;
export const guardarContaNapista = (c: ContaNapista, chave: Buffer) => cifrar(JSON.stringify(c), chave);

type Guardado = CatalogoNapista & { statusNoPortal?: string };

export type CriarSessaoNapista = (c: ContaNapista, app: AppNapista, aoRenovar: (t: TokensNapista) => Promise<void>) => SessaoNapista;
const sessaoPadrao: CriarSessaoNapista = (c, app, aoRenovar) => new SessaoNapista({ access: c.access, refresh: c.refresh, expiraEm: c.expiraEm }, c.sellerId, app, aoRenovar);

export async function cicloNapista(op: OpcoesCiclo, criarSessao: CriarSessaoNapista = sessaoPadrao): Promise<ResumoCiclo> {
  const resumo: ResumoCiclo = { lojas: 0, enviados: 0, removidos: 0, conferidos: 0, erros: 0 };
  const app = appNapistaDoAmbiente(op.urlBase);
  if (!app) return resumo;
  const contas = await prisma.portalConta.findMany({ where: { portal: "NAPISTA", status: "CONECTADA" } });
  for (const conta of contas) {
    resumo.lojas++;
    try {
      const guardada = contaNapistaGuardada(conta.accessTokenCripto, op.chave);
      const aoRenovar = async (t: TokensNapista) => {
        await prisma.portalConta.update({ where: { id: conta.id }, data: { accessTokenCripto: guardarContaNapista({ ...guardada, access: t.access, refresh: t.refresh, expiraEm: t.expiraEm }, op.chave) } });
      };
      const r = await sincronizarLoja(conta.tenantId, conta.id, criarSessao(guardada, app, aoRenovar), op);
      resumo.enviados += r.enviados;
      resumo.removidos += r.removidos;
      resumo.erros += r.erros;
    } catch (e) {
      resumo.erros++;
      const msg = e instanceof Error ? e.message : String(e);
      const recusada = e instanceof ErroNapista && e.semPermissao;
      await prisma.portalConta.update({ where: { id: conta.id }, data: { erro: msg.slice(0, 500), ...(recusada ? { status: "ERRO" } : {}) } });
    }
  }
  return resumo;
}

async function sincronizarLoja(tenantId: string, contaId: string, sessao: SessaoNapista, op: OpcoesCiclo) {
  const agora = op.agora ?? new Date();
  const r = { enviados: 0, removidos: 0, erros: 0 };
  const pubs = await prisma.publicacaoPortal.findMany({
    where: { tenantId, portal: "NAPISTA", status: { notIn: ["ENVIADO", "REMOVENDO"] } },
    include: { veiculo: { include: { fotos: { orderBy: { ordem: "asc" }, select: { id: true } } } } },
  });
  const cache = novosCatalogosNapista();
  let feitas = 0;
  // Os anúncios que a loja já tem no NaPista (no ar, pausados ou rascunho), buscados só se algum carro novo vai ser incluído.
  let existentes: Map<string, OfertaExistente> | null = null;
  const existentePorPlaca = async (placa: string | null): Promise<OfertaExistente | null> => {
    const chave = (placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (chave.length < 7) return null;
    if (!existentes) {
      existentes = new Map();
      // Do menos para o mais importante: se a mesma placa aparece em dois status, vale o que está no ar.
      for (const st of ["DRAFT", "UNPUBLISHED", "PUBLISHED"] as const) for (const o of await sessao.ofertas(st)) if (o.placa) existentes.set(o.placa, o);
    }
    return existentes.get(chave) ?? null;
  };

  for (const p of pubs) {
    if (feitas >= MAX_POR_RODADA) break;
    const v = paraOPortal(p.veiculo, "NAPISTA");
    const noAr = deveEstarNoAr(v.status, p.ativo);
    const fotos = v.fotos.map((f) => linkDaFotoParaPortal(op.urlBase, f.id, op.segredoFotos)).slice(0, MAX_FOTOS);
    const hashFotos = hashDoAnuncio(fotos);
    let catalogo = ((p.catalogo as Guardado | null) ?? {}) as Guardado;
    let pendencias: string[] = [];

    if (noAr && !catalogo.versao) {
      const res = await resolverCatalogoNapista(sessao, v, cache);
      catalogo = { ...catalogo, ...res.catalogo };
      pendencias = res.pendencias;
    }
    const mapa = montarOfertaNapista({ ...v, opcionais: v.opcionais, fotos }, catalogo.versao ?? null);
    const hash = mapa.ok ? hashDoAnuncio({ ...mapa.oferta, fotos: hashFotos }) : null;
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
        let id = p.idExterno;
        let statusLa = catalogo.statusNoPortal ?? null;
        if (!id) {
          // Antes de criar, vê se o NaPista já tem este carro (mesma placa): adota o anúncio, sem duplicar.
          const ja = await existentePorPlaca(v.placa);
          if (ja) {
            id = ja.id;
            statusLa = ja.status;
            await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { idExterno: id } });
            await sessao.atualizar(id, mapa.oferta);
          } else {
            id = await sessao.criar({ ...mapa.oferta, status: "PUBLISHED" });
            statusLa = "PUBLISHED";
            // Grava o código na hora: se as fotos falharem, o próximo ciclo atualiza em vez de criar de novo.
            await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { idExterno: id } });
          }
        } else {
          await sessao.atualizar(id, mapa.oferta);
        }
        if (hashFotos !== p.hashFotos) await sessao.fotosPorUrl(id, fotos);
        if (statusLa !== "PUBLISHED") {
          await sessao.mudarStatus(id, "PUBLISHED");
          statusLa = "PUBLISHED";
        }
        await prisma.publicacaoPortal.update({
          where: { id: p.id },
          data: { status: "PUBLICADO", idExterno: id, hashEnviado: hash, hashFotos, erro: null, tentativas: 0, proximaTentativaEm: null, enviadoEm: agora, catalogo: { ...catalogo, statusNoPortal: statusLa } as object },
        });
        r.enviados++;
      } else if (acao === "remover" && p.idExterno) {
        feitas++;
        const id = p.idExterno;
        if (v.status === "VENDIDO") {
          // Vendido: o NaPista tem status próprio (sai do ar e fica no histórico da loja).
          await sessao.mudarStatus(id, "SOLD");
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", idExterno: null, hashEnviado: null, hashFotos: null, erro: null, tentativas: 0, proximaTentativaEm: null, catalogo: { ...catalogo, statusNoPortal: "SOLD" } as object } });
        } else if (v.status === "RESERVADO" && p.ativo) {
          // Reservado: pausa o anúncio; quando voltar a disponível, só atualiza e republica.
          await sessao.mudarStatus(id, "UNPUBLISHED");
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", hashEnviado: null, erro: null, tentativas: 0, proximaTentativaEm: null, catalogo: { ...catalogo, statusNoPortal: "UNPUBLISHED" } as object } });
        } else {
          await sessao.excluir(id);
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", idExterno: null, hashEnviado: null, hashFotos: null, erro: null, tentativas: 0, proximaTentativaEm: null, catalogo: { ...catalogo, statusNoPortal: "DELETED" } as object } });
        }
        r.removidos++;
      } else if (acao === "remover") {
        await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", erro: null } });
      }
    } catch (e) {
      // NaPista fora do ar ou acesso recusado: vale para a loja toda, não só para este carro.
      if (e instanceof ErroNapista && (!e.http || e.semPermissao)) throw e;
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
