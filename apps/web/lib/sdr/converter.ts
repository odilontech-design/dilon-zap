import { ErroSdrCore } from "@dilon-zap/sdr-core";
import { garantirNegociacao, NOME_DO_FUNIL_DO_SDR } from "./crm";

export { NOME_DO_FUNIL_DO_SDR };

const ETAPAS_COM_INTERESSE = ["INTERESSE", "INFO_SOLICITADA", "REUNIAO"];

/**
 * "Marcar como oportunidade": a empresa demonstrou interesse. A negociação normalmente já existe (criada no primeiro
 * contato registrado); se por algum motivo não existir, é criada agora. Uma ação humana por empresa, repetível.
 */
export async function converterEmNegociacao(deps: Parameters<typeof garantirNegociacao>[0]) {
  const { acesso, empresaId } = deps;
  const ficha = await acesso.sdr.comercial.ficha(empresaId);
  const a = ficha.acompanhamento;

  if (a.etapa === "CONVERTIDA" && a.negociacaoId) return { negociacaoId: a.negociacaoId, jaExistia: true as const, criada: false as const };
  if (!ficha.podeContatar) throw new ErroSdrCore("esta empresa está bloqueada ou pediu para não ser contatada", 409);
  if (!ETAPAS_COM_INTERESSE.includes(a.etapa)) throw new ErroSdrCore("registre o interesse (demonstrou interesse, pediu informações ou reunião) antes de marcar como oportunidade", 409);

  const { negociacaoId, criada } = await garantirNegociacao(deps);
  await acesso.sdr.comercial.marcarConvertida(empresaId, negociacaoId, acesso.user);
  return { negociacaoId, jaExistia: false as const, criada };
}
