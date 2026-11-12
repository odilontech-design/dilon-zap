import { prisma, type Prisma } from "@dilon-zap/db";
import { decidir, deveEstarNoAr, hashDoAnuncio, proximaTentativa } from "./decisao";
import { assinarFoto, decifrar } from "./seguranca";
import { soDigitos } from "./texto";
import { montarAnuncioOlx, type CatalogoOlx } from "./olx/mapa";
import { ErroOlx, enviarLote, LIMITE_LOTE_BYTES, STATUS_IMPORT, statusDoLote, type ItemDoLote } from "./olx/cliente";
import { traduzir } from "./olx/mensagens";

/**
 * Uma rodada da sincronização com os portais, para todas as lojas com conta
 * conectada. Hoje só a OLX: o desenho (fila por carro, hash do último envio,
 * conferência do lote) é o mesmo que Mercado Livre e Webmotors vão usar.
 *
 * Cada loja é tratada em separado: a conta de uma com problema não segura as outras.
 */

export type OpcoesCiclo = {
  chave: Buffer;
  /** Segredo da assinatura dos links das fotos (o mesmo que a rota pública confere). */
  segredoFotos: string;
  /** Endereço público do Zap, de onde a OLX baixa as fotos. */
  urlBase: string;
  agora?: Date;
};

export type ResumoCiclo = { lojas: number; enviados: number; removidos: number; conferidos: number; erros: number };

/** Um lote vale 7 dias na OLX; depois disso não dá mais para consultar. */
const VALIDADE_LOTE_MS = 7 * 24 * 3600_000;

export function linkDaFotoParaPortal(urlBase: string, fotoId: string, segredo: string): string {
  return `${urlBase.replace(/\/$/, "")}/api/portais/foto/${fotoId}/${assinarFoto(fotoId, segredo)}.jpg`;
}

/** O número do anúncio na OLX: o list_id, ou o que vem na URL (".../vi/8000005.htm"). */
function idNaOlx(listId: unknown, url: string | undefined): string | null {
  if (listId !== undefined && listId !== null && String(listId) !== "") return String(listId);
  return url?.match(/(\d{5,})(?:\.htm)?\/?$/)?.[1] ?? null;
}

function textoDaMensagem(m: string[] | string | undefined): string | null {
  if (!m) return null;
  const t = Array.isArray(m) ? m.join("; ") : m;
  return t.trim() || null;
}

export async function cicloPortais(op: OpcoesCiclo): Promise<ResumoCiclo> {
  const resumo: ResumoCiclo = { lojas: 0, enviados: 0, removidos: 0, conferidos: 0, erros: 0 };
  const contas = await prisma.portalConta.findMany({ where: { portal: "OLX", status: "CONECTADA" } });
  for (const conta of contas) {
    resumo.lojas++;
    try {
      const token = decifrar(conta.accessTokenCripto, op.chave);
      resumo.conferidos += await conferirLotes(conta.tenantId, token, op.agora ?? new Date());
      const r = await enviarPendentes(conta.tenantId, conta.id, token, op);
      resumo.enviados += r.enviados;
      resumo.removidos += r.removidos;
      resumo.erros += r.erros;
    } catch (e) {
      resumo.erros++;
      const msg = e instanceof Error ? e.message : String(e);
      // Acesso recusado: a loja precisa conectar de novo. Outro erro (rede,
      // OLX fora): fica registrado e a próxima rodada tenta de novo.
      const recusado = e instanceof ErroOlx && (e.http === 401 || e.http === 403);
      await prisma.portalConta.update({
        where: { id: conta.id },
        data: { erro: msg.slice(0, 500), ...(recusado ? { status: "ERRO" } : {}) },
      });
    }
  }
  return resumo;
}

/** Pergunta à OLX como ficaram os lotes enviados nas rodadas anteriores. */
async function conferirLotes(tenantId: string, token: string, agora: Date): Promise<number> {
  const emAndamento = await prisma.publicacaoPortal.findMany({
    where: { tenantId, portal: "OLX", status: { in: ["ENVIADO", "REMOVENDO"] }, loteToken: { not: null } },
  });
  const porLote = new Map<string, typeof emAndamento>();
  for (const p of emAndamento) porLote.set(p.loteToken!, [...(porLote.get(p.loteToken!) ?? []), p]);

  let conferidos = 0;
  for (const [lote, pubs] of porLote) {
    const vencido = pubs.every((p) => p.enviadoEm && agora.getTime() - p.enviadoEm.getTime() > VALIDADE_LOTE_MS);
    const st = vencido ? null : await statusDoLote(token, lote);
    for (const p of pubs) {
      const item = st?.anuncios[p.idEnviado];
      const removendo = p.status === "REMOVENDO";
      let data: Prisma.PublicacaoPortalUpdateInput | null = null;
      const falha = (erro: string): Prisma.PublicacaoPortalUpdateInput => ({
        status: "ERRO",
        erro: erro.slice(0, 1000),
        loteToken: null,
        tentativas: { increment: 1 },
        proximaTentativaEm: proximaTentativa(p.tentativas + 1, agora),
      });

      if (!st) data = falha("O portal não confirmou o envio a tempo: vai ser reenviado");
      else if (item?.status === "accepted") {
        const id = idNaOlx(item.list_id, item.url) ?? p.idExterno;
        data = removendo
          ? { status: "REMOVIDO", url: null, erro: null, loteToken: null, tentativas: 0, proximaTentativaEm: null }
          : { status: "PUBLICADO", idExterno: id ?? p.idEnviado, url: item.url ?? p.url, erro: null, loteToken: null, tentativas: 0, proximaTentativaEm: null };
      } else if (item?.status === "error" || item?.status === "refused") {
        data = falha(textoDaMensagem(item.message) ?? (item.status === "refused" ? "Recusado pela moderação da OLX" : "Erro na OLX"));
      } else if (item) {
        // pending/queued: segue esperando. Se já veio o número do anúncio, guarda.
        const id = idNaOlx(item.list_id, item.url);
        if (id && id !== p.idExterno) data = { idExterno: id };
      } else if (st.concluido) {
        data = falha("A OLX terminou o lote sem dizer o que houve com este anúncio");
      }
      if (data) {
        await prisma.publicacaoPortal.update({ where: { id: p.id }, data });
        conferidos++;
      }
    }
  }
  return conferidos;
}

type Planejado = { pubId: string; item: ItemDoLote; hash: string | null; tentativas: number };

async function enviarPendentes(tenantId: string, contaId: string, token: string, op: OpcoesCiclo) {
  const agora = op.agora ?? new Date();
  const config = await prisma.veiculosConfig.findUnique({ where: { tenantId } });
  const loja = { cep: config?.cepAnuncios ?? null, telefone: config?.telefoneAnuncios ?? config?.whatsapp ?? null };

  const pubs = await prisma.publicacaoPortal.findMany({
    where: { tenantId, portal: "OLX", status: { notIn: ["ENVIADO", "REMOVENDO"] } },
    include: { veiculo: { include: { fotos: { orderBy: { ordem: "asc" }, select: { id: true } } } } },
  });

  const planejados: Planejado[] = [];
  const r = { enviados: 0, removidos: 0, erros: 0 };
  for (const p of pubs) {
    const v = p.veiculo;
    const noAr = deveEstarNoAr(v.status, p.ativo);
    const mapa = montarAnuncioOlx(
      { ...v, opcionais: v.opcionais, fotos: v.fotos.map((f) => linkDaFotoParaPortal(op.urlBase, f.id, op.segredoFotos)) },
      (p.catalogo as CatalogoOlx | null) ?? null,
      loja,
    );
    const hash = mapa.ok ? hashDoAnuncio(mapa.anuncio) : null;
    const acao = decidir(p, noAr, hash, agora);

    if (acao === "enviar" && mapa.ok) planejados.push({ pubId: p.id, item: { ...mapa.anuncio, id: p.idEnviado }, hash, tentativas: p.tentativas });
    else if (acao === "remover") planejados.push({ pubId: p.id, item: { id: p.idEnviado, operation: "delete" }, hash: null, tentativas: p.tentativas });
    else if (acao === "descartar") {
      await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { status: "REMOVIDO", erro: null, proximaTentativaEm: null } });
    } else if (acao === "bloqueado" && !mapa.ok) {
      const erro = `Falta para anunciar: ${mapa.faltando.join("; ")}`;
      if (p.erro !== erro) await prisma.publicacaoPortal.update({ where: { id: p.id }, data: { erro } });
    }
  }
  if (!planejados.length) return r;

  // Lotes de até ~900 KB (a OLX aceita 1 MB por chamada).
  const lotes: Planejado[][] = [[]];
  let bytes = 0;
  for (const pl of planejados) {
    const tam = Buffer.byteLength(JSON.stringify(pl.item)) + 1;
    if (bytes + tam > LIMITE_LOTE_BYTES && lotes[lotes.length - 1].length) {
      lotes.push([]);
      bytes = 0;
    }
    lotes[lotes.length - 1].push(pl);
    bytes += tam;
  }

  for (const lote of lotes) {
    const resp = await enviarLote(token, lote.map((l) => l.item));
    if (resp.statusCode === 0 && resp.token) {
      for (const l of lote) {
        const remover = l.item.operation === "delete";
        await prisma.publicacaoPortal.update({
          where: { id: l.pubId },
          data: {
            status: remover ? "REMOVENDO" : "ENVIADO",
            loteToken: resp.token,
            enviadoEm: agora,
            ...(remover ? {} : { hashEnviado: l.hash }),
          },
        });
        if (remover) r.removidos++;
        else r.enviados++;
      }
      continue;
    }

    const falhar = (l: Planejado, erro: string) =>
      prisma.publicacaoPortal.update({
        where: { id: l.pubId },
        data: {
          status: "ERRO",
          erro: erro.slice(0, 1000),
          ...(l.hash ? { hashEnviado: l.hash } : {}),
          tentativas: { increment: 1 },
          proximaTentativaEm: proximaTentativa(l.tentativas + 1, agora),
        },
      });

    if (resp.statusCode === -4) {
      // A OLX recusa o lote inteiro quando um anúncio tem problema. Os
      // recusados ficam com o motivo; os demais voltam na próxima rodada.
      const porId = new Map((resp.errors ?? []).map((e) => [e.id, e]));
      for (const l of lote) {
        const e = porId.get(l.item.id);
        if (!e) continue;
        r.erros++;
        await falhar(l, (e.messages ?? []).map((m) => traduzir(m.category, m.message)).join("; ") || "Recusado pela OLX");
      }
      if (!porId.size) for (const l of lote) await falhar(l, STATUS_IMPORT[-4]);
      continue;
    }

    const motivo = STATUS_IMPORT[resp.statusCode] ?? `OLX respondeu ${resp.statusCode}${resp.statusMessage ? `: ${resp.statusMessage}` : ""}`;
    for (const l of lote) await falhar(l, motivo);
    r.erros += lote.length;
    if (resp.statusCode === -2 || resp.statusCode === -6) {
      // Conta bloqueada ou sem plano profissional: insistir não adianta.
      await prisma.portalConta.update({ where: { id: contaId }, data: { status: "ERRO", erro: motivo } });
      break;
    }
  }
  return r;
}

export const telefoneValido = (t: string | null | undefined) => {
  const d = soDigitos(t).replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 10 || d.length === 11;
};
