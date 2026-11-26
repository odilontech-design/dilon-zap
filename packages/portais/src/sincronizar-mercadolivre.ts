import { paraOPortal } from "./ajustes";
import { prisma } from "@dilon-zap/db";
import { decidir, deveEstarNoAr, hashDoAnuncio, proximaTentativa } from "./decisao";
import { cifrar, decifrar } from "./seguranca";
import { linkDaFotoParaPortal, type OpcoesCiclo, type ResumoCiclo } from "./sincronizar";
import { ErroMercadoLivre, SessaoMercadoLivre, appMercadoLivreDoAmbiente, type AppMercadoLivre, type TokensMercadoLivre } from "./mercadolivre/cliente";
import { MAX_FOTOS_MERCADOLIVRE, montarItemMercadoLivre, type LojaParaMercadoLivre } from "./mercadolivre/mapa";

/**
 * Sincronização do estoque com o Mercado Livre (anúncios classificados de veículos). Carro a
 * carro: cria ou atualiza o anúncio, manda a descrição (recurso à parte) e ajusta o status.
 * Mesmas regras de decisão das outras integrações (decisao.ts). Reservado: pausado (volta rápido).
 * Vendido: fechado. Devolvido ou desligado pela loja: fechado e excluído. Carro sem km informada
 * não é publicado. Só se cria anúncio com VAGA no pacote de publicação da loja (o pacote é
 * contratado com o comercial do Mercado Livre): sem vaga, o carro fica com o aviso e tenta de novo.
 */

const MAX_POR_RODADA = 30;
const NOVA_TENTATIVA_SEM_VAGA_MIN = 60;

/** O que fica guardado (cifrado) na conta: o vendedor no Mercado Livre e os tokens do OAuth. */
export type ContaMercadoLivre = { vendedorId: string; access: string; refresh: string; expiraEm: number };
export const contaMercadoLivreGuardada = (guardado: string, chave: Buffer): ContaMercadoLivre => JSON.parse(decifrar(guardado, chave)) as ContaMercadoLivre;
export const guardarContaMercadoLivre = (c: ContaMercadoLivre, chave: Buffer) => cifrar(JSON.stringify(c), chave);

type Guardado = { statusNoPortal?: string };

export type CriarSessaoMercadoLivre = (c: ContaMercadoLivre, app: AppMercadoLivre, aoRenovar: (t: TokensMercadoLivre) => Promise<void>) => SessaoMercadoLivre;
const sessaoPadrao: CriarSessaoMercadoLivre = (c, app, aoRenovar) => new SessaoMercadoLivre({ access: c.access, refresh: c.refresh, expiraEm: c.expiraEm }, c.vendedorId, app, aoRenovar);

/** Os dados da loja que o anúncio leva (WhatsApp, CEP, endereço, site). */
export async function lojaParaMercadoLivre(tenantId: string): Promise<LojaParaMercadoLivre> {
  const c = await prisma.veiculosConfig.findUnique({ where: { tenantId }, select: { nomeLoja: true, whatsapp: true, telefoneAnuncios: true, cepAnuncios: true, cep: true, endereco: true, dominio: true } });
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } });
  return {
    nome: c?.nomeLoja ?? t?.name ?? null,
    whatsapp: c?.telefoneAnuncios ?? c?.whatsapp ?? null,
    cep: c?.cepAnuncios ?? c?.cep ?? null,
    endereco: c?.endereco ?? null,
    email: null,
    site: c?.dominio ? `https://${c.dominio}` : null,
  };
}

export async function cicloMercadoLivre(op: OpcoesCiclo, criarSessao: CriarSessaoMercadoLivre = sessaoPadrao): Promise<ResumoCiclo> {
  const resumo: ResumoCiclo = { lojas: 0, enviados: 0, removidos: 0, conferidos: 0, erros: 0 };
  const app = appMercadoLivreDoAmbiente(op.urlBase);
  if (!app) return resumo;
  const contas = await prisma.portalConta.findMany({ where: { portal: "MERCADO_LIVRE", status: "CONECTADA" } });
  for (const conta of contas) {
    resumo.lojas++;
    try {
      const guardada = contaMercadoLivreGuardada(conta.accessTokenCripto, op.chave);
      // O refresh token é de uso único: grava o novo na hora, antes de qualquer outra chamada.
      const aoRenovar = async (t: TokensMercadoLivre) => {
        guardada.access = t.access;
        guardada.refresh = t.refresh;
        guardada.expiraEm = t.expiraEm;
        await prisma.portalConta.update({ where: { id: conta.id }, data: { accessTokenCripto: guardarContaMercadoLivre(guardada, op.chave) } });
      };
      const r = await sincronizarLoja(conta.tenantId, conta.id, criarSessao(guardada, app, aoRenovar), op);
      resumo.enviados += r.enviados;
      resumo.removidos += r.removidos;
      resumo.erros += r.erros;
    } catch (e) {
      resumo.erros++;
      const msg = e instanceof Error ? e.message : String(e);
      const recusada = e instanceof ErroMercadoLivre && e.semPermissao;
      await prisma.portalConta.update({ where: { id: conta.id }, data: { erro: msg.slice(0, 500), ...(recusada ? { status: "ERRO" } : {}) } });
    }
  }
  return resumo;
}

async function sincronizarLoja(tenantId: string, contaId: string, sessao: SessaoMercadoLivre, op: OpcoesCiclo) {
  const agora = op.agora ?? new Date();
  const r = { enviados: 0, removidos: 0, erros: 0 };
  const loja = await lojaParaMercadoLivre(tenantId);
  const pubs = await prisma.publicacaoPortal.findMany({
    where: { tenantId, portal: "MERCADO_LIVRE", status: { notIn: ["ENVIADO", "REMOVENDO"] } },
    include: { veiculo: { include: { fotos: { orderBy: { ordem: "asc" }, select: { id: true } } } } },
  });
  let feitas = 0;
  // As vagas do pacote, consultadas só quando um carro novo vai ser incluído.
  let vagas: number | null = null;

  for (const p of pubs) {
    if (feitas >= MAX_POR_RODADA) break;
    const v = paraOPortal(p.veiculo, "MERCADO_LIVRE");
    const noAr = deveEstarNoAr(v.status, p.ativo);
    const fotos = v.fotos.map((f) => linkDaFotoParaPortal(op.urlBase, f.id, op.segredoFotos)).slice(0, MAX_FOTOS_MERCADOLIVRE);
    const catalogo = ((p.catalogo as Guardado | null) ?? {}) as Guardado;
    const mapa = montarItemMercadoLivre({ ...v, opcionais: v.opcionais, fotos }, loja);
    const hash = mapa.ok ? hashDoAnuncio({ item: mapa.item, descricao: mapa.descricao }) : null;
    const acao = decidir(p, noAr, hash, agora);

    try {
      if (acao === "descartar") {
        await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", erro: null, proximaTentativaEm: null } });
      } else if (acao === "bloqueado" && !mapa.ok) {
        const erro = `Falta para anunciar: ${mapa.faltando.join("; ")}`;
        if (p.erro !== erro) await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { erro } });
      } else if (acao === "enviar" && mapa.ok) {
        let id = p.idExterno;
        let url = p.url;
        let statusLa = catalogo.statusNoPortal ?? null;
        if (!id) {
          vagas ??= await sessao.vagas();
          if (vagas <= 0) {
            // Sem vaga no pacote: não é erro do carro nem da conta. Avisa e tenta de novo mais tarde.
            await prisma.publicacaoPortal.update({
              where: { id: p.id },
              data: { status: "ERRO", erro: "Sem vaga no pacote de publicação do Mercado Livre: contrate mais anúncios com o Mercado Livre ou tire outro carro do portal", hashEnviado: hash, proximaTentativaEm: new Date(agora.getTime() + NOVA_TENTATIVA_SEM_VAGA_MIN * 60_000) },
            });
            r.erros++;
            continue;
          }
          feitas++;
          const criado = await sessao.criar(mapa.item);
          id = criado.id;
          url = criado.url;
          vagas--;
          statusLa = "active";
          // Grava o código na hora: se a descrição falhar, o próximo ciclo atualiza em vez de criar de novo (e gastar outra vaga).
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { idExterno: id, url } });
          if (mapa.descricao) await sessao.descricaoNova(id, mapa.descricao);
        } else {
          feitas++;
          // Anúncio existente: preço, fotos e atributos (o título e a categoria o Mercado Livre não deixa trocar depois de publicado).
          await sessao.atualizar(id, { price: mapa.item.price, pictures: mapa.item.pictures, attributes: mapa.item.attributes, seller_contact: mapa.item.seller_contact });
          if (mapa.descricao) await sessao.descricaoTroca(id, mapa.descricao);
          if (statusLa && statusLa !== "active") {
            await sessao.mudarStatus(id, "active");
            statusLa = "active";
          }
        }
        await prisma.publicacaoPortal.update({
          where: { id: p.id },
          data: { status: "PUBLICADO", idExterno: id, url, hashEnviado: hash, erro: null, tentativas: 0, proximaTentativaEm: null, enviadoEm: agora, catalogo: { statusNoPortal: statusLa ?? "active" } as object },
        });
        r.enviados++;
      } else if (acao === "remover" && p.idExterno) {
        feitas++;
        const id = p.idExterno;
        const limpa = { hashEnviado: null, erro: null, tentativas: 0, proximaTentativaEm: null };
        if (v.status === "VENDIDO") {
          // Vendido: fecha o anúncio (fica no histórico da loja).
          await sessao.mudarStatus(id, "closed");
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", idExterno: null, ...limpa, catalogo: { statusNoPortal: "closed" } as object } });
        } else if (v.status === "RESERVADO" && p.ativo) {
          // Reservado: pausa; quando voltar a disponível, só atualiza e reativa.
          await sessao.mudarStatus(id, "paused");
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", ...limpa, catalogo: { statusNoPortal: "paused" } as object } });
        } else {
          await sessao.excluir(id);
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", idExterno: null, url: null, ...limpa, catalogo: { statusNoPortal: "deleted" } as object } });
        }
        r.removidos++;
      } else if (acao === "remover") {
        await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", erro: null } });
      }
    } catch (e) {
      // Mercado Livre fora do ar ou acesso recusado: vale para a loja toda, não só para este carro.
      if (e instanceof ErroMercadoLivre && (!e.http || e.semPermissao)) throw e;
      r.erros++;
      await prisma.publicacaoPortal.update({
        where: { id: p.id },
        data: { status: "ERRO", erro: (e instanceof Error ? e.message : String(e)).slice(0, 1000), ...(hash ? { hashEnviado: hash } : {}), tentativas: { increment: 1 }, proximaTentativaEm: proximaTentativa(p.tentativas + 1, agora) },
      });
    }
  }
  await prisma.portalConta.update({ where: { id: contaId }, data: { erro: null } });
  return r;
}
