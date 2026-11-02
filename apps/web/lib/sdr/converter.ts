import type { prisma as clientePrisma } from "@dilon-zap/db";
import { ErroSdrCore } from "@dilon-zap/sdr-core";
import type { criarNegociacao } from "@/lib/negociacoes";
import type { AcessoLiberado } from "./rota";

export const NOME_DO_FUNIL_DO_SDR = "Prospecção ativa";
const ETAPAS_COM_INTERESSE = ["INTERESSE", "INFO_SOLICITADA", "REUNIAO"];

/**
 * A única ponte do SDR com o CRM, e fica no site, não no pacote do SDR. Cria o contato com o número já cadastrado,
 * sem perguntar ao WhatsApp se ele existe (o contato nasce com o formato padrão e o sistema acerta depois, como no
 * cadastro manual), e abre a negociação na primeira etapa do funil "Prospecção ativa".
 */
export async function converterEmNegociacao(args: { acesso: AcessoLiberado; empresaId: string; prisma: typeof clientePrisma; criarNegociacao: typeof criarNegociacao }) {
  const { acesso, empresaId, prisma, criarNegociacao: criar } = args;
  const tenantId = acesso.user.tenantId;
  const [ficha, empresa] = await Promise.all([acesso.sdr.comercial.ficha(empresaId), acesso.sdr.empresas.obter(empresaId)]);
  const a = ficha.acompanhamento;

  if (a.negociacaoId) return { negociacaoId: a.negociacaoId, jaExistia: true as const };
  if (!ficha.podeContatar) throw new ErroSdrCore("esta empresa está bloqueada ou pediu para não ser contatada", 409);
  if (!ETAPAS_COM_INTERESSE.includes(a.etapa)) throw new ErroSdrCore("registre o interesse (demonstrou interesse, pediu informações ou reunião) antes de enviar ao CRM", 409);

  const telefone = (a.decisorTelefone ?? empresa.telefone ?? "").replace(/\D/g, "");
  if (!telefone) throw new ErroSdrCore("informe um telefone do decisor ou da empresa para criar o contato no CRM", 422);

  const funil = await prisma.funil.findFirst({ where: { tenantId, nome: { equals: NOME_DO_FUNIL_DO_SDR, mode: "insensitive" }, arquivadoEm: null } });
  if (!funil) throw new ErroSdrCore(`não existe o funil “${NOME_DO_FUNIL_DO_SDR}” nesta empresa; crie-o no CRM antes`, 422);
  const etapa = await prisma.stage.findFirst({ where: { tenantId, funilId: funil.id }, orderBy: { position: "asc" } });
  if (!etapa) throw new ErroSdrCore(`o funil “${NOME_DO_FUNIL_DO_SDR}” não tem etapas`, 422);

  const nomeEmpresa = empresa.nomeFantasia ?? empresa.razaoSocial ?? "Empresa";
  const nomeDoContato = a.decisorNome ? `${a.decisorNome} (${nomeEmpresa})` : nomeEmpresa;
  const jid = `${telefone}@s.whatsapp.net`;
  let contato = await prisma.contact.findFirst({ where: { tenantId, OR: [{ waJid: jid }, { phoneNumber: telefone }] } });
  if (!contato) contato = await prisma.contact.create({ data: { tenantId, waJid: jid, name: nomeDoContato, nameManual: true } });

  const negociacao = await criar({
    tenantId,
    quem: acesso.user,
    contactId: contato.id,
    funilId: funil.id,
    stageId: etapa.id,
    titulo: `${nomeEmpresa}${a.produto ? ` — ${a.produto === "DILON_ZAP" ? "Dilon Zap" : "Dilon Facilities"}` : ""}`,
    valorCents: 0,
    recorrencia: "UNICA",
    responsavelId: acesso.user.id,
    origem: "SDR",
    previsaoFechamento: null,
  });
  await acesso.sdr.comercial.marcarConvertida(empresaId, negociacao.id, acesso.user);
  return { negociacaoId: negociacao.id, jaExistia: false as const };
}
