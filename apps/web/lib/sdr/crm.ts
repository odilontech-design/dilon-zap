import type { prisma as clientePrisma } from "@dilon-zap/db";
import { ErroSdrCore } from "@dilon-zap/sdr-core";
import type { sdrDoTenant } from "@dilon-zap/sdr-core";

/**
 * A única ponte do SDR com o CRM, e fica no site, não no pacote do SDR.
 *
 * - O contato nasce com o número já cadastrado, SEM perguntar ao WhatsApp se ele existe (formato padrão, que o
 *   sistema acerta depois, como no cadastro manual).
 * - A negociação abre na primeira etapa do funil "Prospecção ativa", com o usuário logado como responsável.
 * - Cada contato e resposta vira uma nota na linha do tempo; o follow-up vira tarefa. Falha aqui NUNCA desfaz
 *   o que o SDR já registrou: o resultado volta como aviso.
 */

export const NOME_DO_FUNIL_DO_SDR = "Prospecção ativa";
const PREFIXO_DA_TAREFA = "SDR: ";

/** O que esta ponte precisa de quem a chama (a rota do SDR entrega isto): o usuário da sessão e o SDR preso à empresa dele. */
export type AcessoDoCrm = { user: { id: string; name: string; tenantId: string }; sdr: ReturnType<typeof sdrDoTenant> };
/** Mesma assinatura de criarNegociacao (apps/web/lib/negociacoes.ts), que também grava o evento "criada" e a tarefa automática do funil. */
export type CriarNegociacao = (args: {
  tenantId: string;
  quem: { id: string; name: string };
  contactId: string;
  funilId: string;
  stageId: string;
  titulo: string;
  valorCents: number;
  recorrencia: "UNICA" | "MENSAL";
  responsavelId: string | null;
  origem: string | null;
  previsaoFechamento: Date | null;
}) => Promise<{ id: string }>;

type Deps = { acesso: AcessoDoCrm; empresaId: string; prisma: typeof clientePrisma; criarNegociacao: CriarNegociacao };

const ROTULO_ETAPA: Record<string, string> = {
  CONTATADA: "aguardando resposta",
  RESPONDEU: "respondeu",
  INTERESSE: "demonstrou interesse",
  INFO_SOLICITADA: "solicitou informações",
  REUNIAO: "solicitou reunião",
  SEM_INTERESSE: "sem interesse",
  NAO_CONTATAR: "pediu para não ser contatada",
};
const ROTULO_CANAL: Record<string, string> = { EMAIL: "e-mail", LIGACAO: "ligação", MENSAGEM: "mensagem profissional", WHATSAPP: "WhatsApp", OUTRO: "outro canal" };
const TIPO_DA_TAREFA: Record<string, "EMAIL" | "LIGACAO" | "WHATSAPP" | "TAREFA"> = { EMAIL: "EMAIL", LIGACAO: "LIGACAO", WHATSAPP: "WHATSAPP", MENSAGEM: "TAREFA", OUTRO: "TAREFA" };

/**
 * Garante contato e negociação no CRM para a empresa. Idempotente: se já existe, devolve a mesma. Uma trava por empresa
 * (no Postgres) faz duas chamadas simultâneas esperarem uma pela outra, então nunca nascem duas negociações.
 */
export async function garantirNegociacao(deps: Deps) {
  const { prisma, acesso, empresaId } = deps;
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${`sdr-crm:${acesso.user.tenantId}:${empresaId}`}))) t`;
      return criarOuReaproveitar(deps);
    },
    { maxWait: 20_000, timeout: 30_000 }
  );
}

async function criarOuReaproveitar({ acesso, empresaId, prisma, criarNegociacao: criar }: Deps) {
  const tenantId = acesso.user.tenantId;
  const [ficha, empresa] = await Promise.all([acesso.sdr.comercial.ficha(empresaId), acesso.sdr.empresas.obter(empresaId)]);
  const a = ficha.acompanhamento;

  if (a.negociacaoId) return { negociacaoId: a.negociacaoId, criada: false as const };
  if (!ficha.podeContatar) throw new ErroSdrCore("esta empresa está bloqueada ou pediu para não ser contatada", 409);

  const telefone = (a.decisorTelefone ?? empresa.telefone ?? "").replace(/\D/g, "");
  if (!telefone) throw new ErroSdrCore("a empresa não tem telefone: o CRM exige um número para criar o contato", 422);

  const funil = await prisma.funil.findFirst({ where: { tenantId, nome: { equals: NOME_DO_FUNIL_DO_SDR, mode: "insensitive" }, arquivadoEm: null } });
  if (!funil) throw new ErroSdrCore(`não existe o funil “${NOME_DO_FUNIL_DO_SDR}” nesta empresa; crie-o no CRM antes`, 422);
  const etapa = await prisma.stage.findFirst({ where: { tenantId, funilId: funil.id }, orderBy: { position: "asc" } });
  if (!etapa) throw new ErroSdrCore(`o funil “${NOME_DO_FUNIL_DO_SDR}” não tem etapas`, 422);

  const nomeEmpresa = empresa.nomeFantasia ?? empresa.razaoSocial ?? "Empresa";
  const nomeDoContato = a.decisorNome ? `${a.decisorNome} (${nomeEmpresa})` : nomeEmpresa;
  const jid = `${telefone}@s.whatsapp.net`;
  let contato = await prisma.contact.findFirst({ where: { tenantId, OR: [{ waJid: jid }, { phoneNumber: telefone }] } });
  if (!contato) {
    try {
      contato = await prisma.contact.create({ data: { tenantId, waJid: jid, name: nomeDoContato, nameManual: true } });
    } catch {
      // Outro caminho do sistema criou o mesmo contato neste instante: usa o que já existe.
      contato = await prisma.contact.findFirst({ where: { tenantId, waJid: jid } });
      if (!contato) throw new ErroSdrCore("não foi possível criar o contato no CRM", 500);
    }
  }

  // Já existe negociação aberta deste contato neste funil (por exemplo, criada à mão): usa ela em vez de duplicar.
  const aberta = await prisma.negociacao.findFirst({ where: { tenantId, contactId: contato.id, funilId: funil.id, status: "ABERTA" }, orderBy: { createdAt: "desc" } });
  const negociacao =
    aberta ??
    (await criar({
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
    }));
  await acesso.sdr.comercial.vincularNegociacao(empresaId, negociacao.id, acesso.user);
  return { negociacaoId: negociacao.id, criada: !aberta };
}

/** Passa para o CRM (nota na linha do tempo e tarefa de follow-up) o que o SDR acabou de registrar. */
export type EventoParaOCrm =
  | { tipo: "CONTATO"; canal: string; resultado?: string | null; assunto?: string | null; texto: string; proximaAcao?: string | null; proximaAcaoEm?: Date | null }
  | { tipo: "RESPOSTA"; etapa: string; nota?: string | null };

export async function espelharNoCrm(deps: Deps, evento: EventoParaOCrm): Promise<{ ok: true; negociacaoId: string; criada: boolean } | { ok: false; motivo: string }> {
  const { acesso, prisma } = deps;
  const tenantId = acesso.user.tenantId;
  try {
    let negociacaoId: string;
    let criada = false;
    if (evento.tipo === "CONTATO") {
      ({ negociacaoId, criada } = await garantirNegociacao(deps));
    } else {
      const existente = (await acesso.sdr.comercial.ficha(deps.empresaId)).acompanhamento.negociacaoId;
      if (!existente) return { ok: false, motivo: "a empresa ainda não está no CRM" };
      negociacaoId = existente;
    }

    const texto =
      evento.tipo === "CONTATO"
        ? [`SDR · Contato registrado (${ROTULO_CANAL[evento.canal] ?? evento.canal})${evento.resultado ? ` — ${evento.resultado}` : ""}`, evento.assunto ? `Assunto: ${evento.assunto}` : null, "", evento.texto].filter((l) => l !== null).join("\n")
        : `SDR · ${ROTULO_ETAPA[evento.etapa] ?? evento.etapa}${evento.nota ? `: ${evento.nota}` : ""}`;
    await prisma.negociacaoNota.create({ data: { tenantId, negociacaoId, texto: texto.slice(0, 4000), porUserId: acesso.user.id, porNome: acesso.user.name } });

    const encerra = evento.tipo === "RESPOSTA" && (evento.etapa === "SEM_INTERESSE" || evento.etapa === "NAO_CONTATAR");
    const novoFollowUp = evento.tipo === "CONTATO" && evento.proximaAcaoEm;
    if (encerra || novoFollowUp || evento.tipo === "RESPOSTA") {
      // Follow-up antigo do SDR deixa de valer: a resposta ou o novo contato o substitui.
      await prisma.tarefaNegociacao.updateMany({
        where: { tenantId, negociacaoId, concluidaEm: null, titulo: { startsWith: PREFIXO_DA_TAREFA } },
        data: { concluidaEm: new Date(), anotacao: encerra ? "Encerrada: a empresa respondeu e não quer seguir." : "Substituída por um registro mais novo do SDR." },
      });
    }
    if (novoFollowUp && evento.tipo === "CONTATO") {
      await prisma.tarefaNegociacao.create({
        data: { tenantId, negociacaoId, tipo: TIPO_DA_TAREFA[evento.canal] ?? "TAREFA", titulo: `${PREFIXO_DA_TAREFA}${evento.proximaAcao || "Fazer follow-up"}`.slice(0, 200), venceEm: evento.proximaAcaoEm!, responsavelId: acesso.user.id },
      });
    }
    return { ok: true, negociacaoId, criada };
  } catch (e) {
    if (e instanceof ErroSdrCore) return { ok: false, motivo: e.message };
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 200) : "falha ao registrar no CRM" };
  }
}
