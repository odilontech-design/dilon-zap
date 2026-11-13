import { prisma } from "@dilon-zap/db";
import { decidir, deveEstarNoAr, hashDoAnuncio, proximaTentativa } from "./decisao";
import { decifrar } from "./seguranca";
import { linkDaFotoParaPortal, type OpcoesCiclo, type ResumoCiclo } from "./sincronizar";
import { catalogoCompleto, novosCatalogos, resolverCatalogo } from "./webmotors/catalogo";
import { ErroSoap, ErroWebmotors, SessaoWebmotors, type CredenciaisWebmotors } from "./webmotors/cliente";
import { montarAnuncioWebmotors, type CatalogoWebmotors } from "./webmotors/mapa";

/**
 * Sincronização do estoque com a Webmotors. Diferente da OLX (que recebe um lote e responde
 * depois), a Webmotors responde na hora, carro a carro: incluir, alterar, excluir e as fotos.
 * Então não há "enviado, aguardando": o anúncio vai direto para "No ar" ou "Com problema".
 *
 * Mesmas regras de decisão da OLX (decisao.ts): disponível e marcado publica; mudou preço,
 * km, fotos ou ficha, atualiza; reservado, vendido ou devolvido sai do ar. E uma a mais, da
 * gestão: carro sem km informada não publica (nunca vai como "0 km").
 */

/** Teto de operações por rodada, para uma loja grande não prender o ciclo (e a Webmotors) de uma vez. */
const MAX_POR_RODADA = 30;
const MAX_FOTOS = 20;

export const credenciaisDaConta = (guardado: string, chave: Buffer): CredenciaisWebmotors => JSON.parse(decifrar(guardado, chave)) as CredenciaisWebmotors;

type Guardado = Partial<CatalogoWebmotors> & { modalidadeEnviada?: string };

export async function cicloWebmotors(op: OpcoesCiclo, criarSessao: (c: CredenciaisWebmotors) => SessaoWebmotors = (c) => new SessaoWebmotors(c)): Promise<ResumoCiclo> {
  const resumo: ResumoCiclo = { lojas: 0, enviados: 0, removidos: 0, conferidos: 0, erros: 0 };
  const contas = await prisma.portalConta.findMany({ where: { portal: "WEBMOTORS", status: "CONECTADA" } });
  for (const conta of contas) {
    resumo.lojas++;
    try {
      const r = await sincronizarLoja(conta.tenantId, conta.id, conta.planoPadrao, criarSessao(credenciaisDaConta(conta.accessTokenCripto, op.chave)), op);
      resumo.enviados += r.enviados;
      resumo.removidos += r.removidos;
      resumo.erros += r.erros;
    } catch (e) {
      resumo.erros++;
      const msg = e instanceof Error ? e.message : String(e);
      // Sem permissão ou credencial recusada: a loja precisa corrigir (não adianta insistir).
      const recusada = e instanceof ErroWebmotors && (e.semPermissao || e.sessaoExpirada);
      await prisma.portalConta.update({ where: { id: conta.id }, data: { erro: msg.slice(0, 500), ...(recusada ? { status: "ERRO" } : {}) } });
    }
  }
  return resumo;
}

async function sincronizarLoja(tenantId: string, contaId: string, planoPadrao: string | null, sessao: SessaoWebmotors, op: OpcoesCiclo) {
  const agora = op.agora ?? new Date();
  const r = { enviados: 0, removidos: 0, erros: 0 };
  const pubs = await prisma.publicacaoPortal.findMany({
    where: { tenantId, portal: "WEBMOTORS", status: { notIn: ["ENVIADO", "REMOVENDO"] } },
    include: { veiculo: { include: { fotos: { orderBy: { ordem: "asc" }, select: { id: true } } } } },
  });
  const cache = novosCatalogos();
  let feitas = 0;

  for (const p of pubs) {
    if (feitas >= MAX_POR_RODADA) break;
    const v = p.veiculo;
    const noAr = deveEstarNoAr(v.status, p.ativo);
    const fotos = v.fotos.map((f) => linkDaFotoParaPortal(op.urlBase, f.id, op.segredoFotos)).slice(0, MAX_FOTOS);
    const hashFotos = hashDoAnuncio(fotos);
    const plano = p.plano ?? planoPadrao;
    let catalogo = ((p.catalogo as Guardado | null) ?? {}) as Guardado;
    let pendencias: string[] = [];

    // Só gasta chamada ao catálogo de quem precisa publicar.
    if (noAr && !catalogoCompleto(catalogo)) {
      const res = await resolverCatalogo(sessao, v, cache);
      // O que a gestão escolheu à mão vence o automático.
      catalogo = { ...res.catalogo, ...Object.fromEntries(Object.entries(catalogo).filter(([, val]) => val)) };
      pendencias = res.pendencias;
    }
    const carro = { ...v, opcionais: v.opcionais, fotos };
    const mapa = montarAnuncioWebmotors(carro, catalogoCompleto(catalogo) ? catalogo : null, plano, Number(p.idExterno ?? 0));
    // O hash cobre o anúncio e as fotos, e não o código (que só existe depois do primeiro envio): foto nova também é "mudou".
    const hash = mapa.ok ? hashDoAnuncio({ ...mapa.anuncio, CodigoAnuncio: 0, fotos: hashFotos }) : null;
    const acao = decidir(p, noAr, hash, agora);

    try {
      if (acao === "descartar") {
        await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", erro: null, proximaTentativaEm: null } });
      } else if (acao === "bloqueado" && !mapa.ok) {
        // As pendências do catálogo ("Marca X não identificada") dizem mais que o genérico "escolher no catálogo".
        const faltas = pendencias.length ? [...pendencias, ...mapa.faltando.filter((f) => !f.startsWith("Escolher marca, modelo"))] : mapa.faltando;
        const erro = `Falta para anunciar: ${faltas.join("; ")}`;
        if (p.erro !== erro || JSON.stringify(p.catalogo) !== JSON.stringify(catalogo)) {
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { erro, catalogo: catalogo as object } });
        }
      } else if (acao === "enviar" && mapa.ok) {
        feitas++;
        let codigo = p.idExterno;
        if (!codigo) {
          codigo = await sessao.incluirCarro({ ...mapa.anuncio, CodigoAnuncio: 0 });
          // Grava o código na hora: se as fotos falharem, o próximo ciclo altera em vez de incluir de novo.
          await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { idExterno: codigo } });
        } else {
          await sessao.alterarCarro({ ...mapa.anuncio, CodigoAnuncio: Number(codigo) });
          const enviada = (catalogo as Guardado).modalidadeEnviada;
          if (enviada && enviada !== plano) await sessao.trocarModalidade(codigo, plano!);
        }
        if (hashFotos !== p.hashFotos) await sincronizarFotos(sessao, codigo, fotos);
        await prisma.publicacaoPortal.update({
          where: { id: p.id },
          data: {
            status: "PUBLICADO",
            idExterno: codigo,
            hashEnviado: hash,
            hashFotos,
            erro: null,
            tentativas: 0,
            proximaTentativaEm: null,
            enviadoEm: agora,
            catalogo: { ...catalogo, modalidadeEnviada: plano } as object,
          },
        });
        r.enviados++;
      } else if (acao === "remover" && p.idExterno) {
        feitas++;
        await sessao.excluirCarro(p.idExterno, v.status === "VENDIDO" ? "Vendido" : "Retirado do estoque");
        await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", idExterno: null, hashEnviado: null, hashFotos: null, erro: null, tentativas: 0, proximaTentativaEm: null } });
        r.removidos++;
      } else if (acao === "remover") {
        await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", erro: null } });
      }
    } catch (e) {
      // A Webmotors fora do ar, sem permissão ou sessão que não renova: vale para a loja toda, não só para este carro.
      if (e instanceof ErroSoap && !(e instanceof ErroWebmotors) || (e instanceof ErroWebmotors && (e.semPermissao || e.sessaoExpirada))) throw e;
      r.erros++;
      await prisma.publicacaoPortal.update({
        where: { id: p.id },
        data: {
          status: "ERRO",
          erro: (e instanceof Error ? e.message : String(e)).slice(0, 1000),
          ...(hash ? { hashEnviado: hash } : {}),
          catalogo: catalogo as object,
          tentativas: { increment: 1 },
          proximaTentativaEm: proximaTentativa(p.tentativas + 1, agora),
        },
      });
    }
  }
  await prisma.portalConta.update({ where: { id: contaId }, data: { erro: null } });
  return r;
}

/** Deixa na Webmotors exatamente as fotos da ficha, na ordem: apaga as de lá e envia de novo (a capa é a primeira). */
async function sincronizarFotos(sessao: SessaoWebmotors, codigo: string, fotos: string[]) {
  for (const f of await sessao.fotos(codigo)) await sessao.excluirFoto(codigo, f.codigo);
  for (const url of fotos) await sessao.incluirFotoUrl(codigo, url);
}
