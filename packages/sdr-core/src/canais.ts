import { prisma, Prisma } from "@dilon-zap/db";
import { z } from "zod";
import { exigirContatavel, exigirEmpresa, obterAbordagem, registrarContato } from "./comercial";
import { ErroSdrCore } from "./erros";
import { inicioDoDia } from "./ia/config";
import { dominioDoEmail, normalizarEmail, normalizarTelefone } from "./normalizacao";
import { bloqueiosDaEmpresa, carregarListas } from "./supressao";

/**
 * Saída das abordagens aprovadas por e-mail e por WhatsApp.
 *
 * E-mail: sai pela caixa SMTP configurada no servidor, só de abordagem APROVADA cujo texto continua idêntico ao
 * aprovado, com UM envio por abordagem, versão e destinatário, limite diário e rodapé de descadastro.
 *
 * WhatsApp: o sistema não envia. Ele só autoriza abrir a conversa no Inbox com a mensagem pronta, uma por clique,
 * e quem envia é a pessoa, confirmando na tela do Inbox. Há limite diário e intervalo mínimo entre aberturas.
 */

type Autor = { id: string; name: string };

export type MensagemDeEmail = { de: { nome: string; email: string }; para: string; assunto: string; texto: string; cabecalhos: Record<string, string> };
/** Quem de fato fala SMTP. Fica no site (apps/web), para este pacote não depender de biblioteca de e-mail. */
export type EnviadorDeEmail = {
  configurado(): boolean;
  remetente(): { nome: string; email: string };
  enviar(m: MensagemDeEmail): Promise<{ messageId: string }>;
};

export const RODAPE_DE_DESCADASTRO = "Para não receber mais mensagens da Dilon Tech, responda este e-mail com “não contatar”.";
const JA_TEM_DESCADASTRO = /n[ãa]o receber|descad|n[ãa]o contatar|remov(er|emos)/i;

const ENVIO_TRAVADO_MS = 5 * 60_000;
const AGORA = () => new Date();

export const envioDeEmailSchema = z
  .object({
    /** Se omitido: e-mail do decisor, e na falta dele o da empresa. */
    para: z.string().trim().max(254).optional(),
    proximaAcao: z.string().trim().max(300).nullable().optional(),
    proximaAcaoEm: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export function corpoDoEmail(textoAprovado: string): string {
  const corpo = textoAprovado.trimEnd();
  return JA_TEM_DESCADASTRO.test(corpo) ? corpo : `${corpo}\n\n--\n${RODAPE_DE_DESCADASTRO}`;
}

export async function situacaoDoEmail(tenantId: string, enviador: EnviadorDeEmail, limiteDiario: number) {
  const configurado = enviador.configurado();
  const enviadosHoje = await prisma.sdrEnvioEmail.count({ where: { tenantId, status: { in: ["ENVIADO", "ENVIANDO"] }, createdAt: { gte: inicioDoDia(AGORA()) } } });
  return { configurado, de: configurado ? enviador.remetente() : null, limiteDiario, enviadosHoje };
}

/** O destinatário (e o domínio dele) não pode estar na lista de bloqueio, além da empresa. */
async function exigirDestinatarioLivre(tenantId: string, para: string) {
  const dominio = dominioDoEmail(para);
  const achados = bloqueiosDaEmpresa({ cnpj: null, dominio, emailDominio: dominio, email: para, telefone: null }, await carregarListas(tenantId));
  if (achados.length) throw new ErroSdrCore("este e-mail ou domínio está na lista de bloqueio", 409);
}

export async function enviarEmailDaAbordagem(tenantId: string, abordagemId: string, bruto: unknown, autor: Autor, enviador: EnviadorDeEmail, limiteDiario: number) {
  const d = envioDeEmailSchema.parse(bruto ?? {});
  if (!enviador.configurado()) throw new ErroSdrCore("o envio de e-mail não está configurado no servidor", 503);

  const a = await obterAbordagem(tenantId, abordagemId);
  if (a.canal !== "EMAIL") throw new ErroSdrCore("esta abordagem não é um e-mail", 409);
  if (a.status !== "APROVADA" || a.textoAprovado !== a.texto || (a.assuntoAprovado ?? null) !== (a.assunto ?? null) || !a.assuntoAprovado?.trim()) {
    throw new ErroSdrCore("só dá para enviar um e-mail aprovado, com assunto e com o texto exatamente como foi aprovado", 409);
  }
  const empresa = await exigirEmpresa(tenantId, a.empresaId);
  await exigirContatavel(tenantId, empresa);

  const acomp = await prisma.sdrAcompanhamento.findUnique({ where: { tenantId_empresaId: { tenantId, empresaId: a.empresaId } } });
  const bruto_ = d.para || acomp?.decisorEmail || empresa.email;
  if (!bruto_) throw new ErroSdrCore("informe o e-mail de destino: a empresa e o decisor não têm e-mail cadastrado", 422);
  const email = normalizarEmail(bruto_);
  if (!email.valor) throw new ErroSdrCore("o e-mail de destino não parece válido", 400);
  const para = email.valor;
  await exigirDestinatarioLivre(tenantId, para);

  const enviadosHoje = await prisma.sdrEnvioEmail.count({ where: { tenantId, status: { in: ["ENVIADO", "ENVIANDO"] }, createdAt: { gte: inicioDoDia(AGORA()) } } });
  if (enviadosHoje >= limiteDiario) throw new ErroSdrCore(`o limite de ${limiteDiario} e-mails por dia foi atingido; continue amanhã`, 429);

  // Uma linha por abordagem, versão e destinatário: o banco impede o envio em duplicidade, mesmo com dois cliques simultâneos.
  const corpo = corpoDoEmail(a.textoAprovado!);
  const assunto = a.assuntoAprovado!.trim();
  let envioId: string;
  try {
    envioId = (await prisma.sdrEnvioEmail.create({ data: { tenantId, empresaId: a.empresaId, abordagemId, versao: a.versao, para, assunto, corpo, status: "ENVIANDO", enviadoPorId: autor.id, enviadoPorNome: autor.name } })).id;
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    const existente = await prisma.sdrEnvioEmail.findUniqueOrThrow({ where: { tenantId_abordagemId_versao_para: { tenantId, abordagemId, versao: a.versao, para } } });
    if (existente.status === "ENVIADO") throw new ErroSdrCore(`este e-mail já foi enviado para ${para}`, 409);
    if (existente.status === "ENVIANDO" && Date.now() - existente.updatedAt.getTime() < ENVIO_TRAVADO_MS) throw new ErroSdrCore("este e-mail está sendo enviado agora", 409);
    // Falhou antes (ou travou): uma nova tentativa assume a mesma linha, e só uma chamada consegue.
    const assumiu = await prisma.sdrEnvioEmail.updateMany({ where: { id: existente.id, status: existente.status, updatedAt: existente.updatedAt }, data: { status: "ENVIANDO", erro: null, corpo, assunto } });
    if (assumiu.count !== 1) throw new ErroSdrCore("este e-mail está sendo enviado agora", 409);
    envioId = existente.id;
  }

  // O remetente é sempre quem está logado (o responsável pelo contato); só o endereço vem da caixa configurada.
  const de = { nome: autor.name, email: enviador.remetente().email };
  let messageId: string;
  try {
    ({ messageId } = await enviador.enviar({
      de,
      para,
      assunto,
      texto: corpo,
      cabecalhos: { "List-Unsubscribe": `<mailto:${de.email}?subject=nao-contatar>`, "Auto-Submitted": "no" },
    }));
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "falha desconhecida").slice(0, 300);
    await prisma.sdrEnvioEmail.update({ where: { id: envioId }, data: { status: "FALHOU", erro: msg } });
    throw new ErroSdrCore(`o e-mail não foi enviado: ${msg}`, 502);
  }
  await prisma.sdrEnvioEmail.update({ where: { id: envioId }, data: { status: "ENVIADO", messageId } });

  const contato = await registrarContato(
    tenantId,
    abordagemId,
    { canal: "EMAIL", resultado: `e-mail enviado pelo sistema para ${para}`, proximaAcao: d.proximaAcao ?? null, ...(d.proximaAcaoEm === undefined ? {} : { proximaAcaoEm: d.proximaAcaoEm }) },
    autor
  );
  return { envioId, para, assunto, messageId, interacao: contato.interacao, empresaId: a.empresaId };
}

/* ------------------------------------------------------------- WhatsApp ---- */

export type LimitesDoWhatsapp = { limiteDiario: number; intervaloMinimoSegundos: number };
export const PREFIXO_ABERTURA = "conversa aberta no WhatsApp";

/**
 * Autoriza abrir UMA conversa no Inbox com a mensagem aprovada. Não envia nada e não fala com o WhatsApp: devolve o
 * endereço da tela "abrir conversa", onde a pessoa vê a mensagem e clica em Enviar.
 */
export async function prepararConversaNoWhatsapp(tenantId: string, abordagemId: string, autor: Autor, limites: LimitesDoWhatsapp) {
  const a = await obterAbordagem(tenantId, abordagemId);
  if (a.canal !== "WHATSAPP" && a.canal !== "MENSAGEM") throw new ErroSdrCore("esta abordagem não é uma mensagem de WhatsApp", 409);
  if (a.status !== "APROVADA" || a.textoAprovado !== a.texto) throw new ErroSdrCore("só dá para abrir a conversa com uma mensagem aprovada, com o texto exatamente como foi aprovado", 409);
  const empresa = await exigirEmpresa(tenantId, a.empresaId);
  await exigirContatavel(tenantId, empresa);

  const acomp = await prisma.sdrAcompanhamento.findUnique({ where: { tenantId_empresaId: { tenantId, empresaId: a.empresaId } } });
  const origem = acomp?.decisorTelefone || empresa.telefone;
  if (!origem) throw new ErroSdrCore("a empresa e o decisor não têm telefone cadastrado", 422);
  const telefone = normalizarTelefone(origem).valor;
  if (!telefone) throw new ErroSdrCore("o telefone cadastrado não parece válido", 400);
  const bloqueios = bloqueiosDaEmpresa({ cnpj: null, dominio: null, emailDominio: null, email: null, telefone }, await carregarListas(tenantId));
  if (bloqueios.length) throw new ErroSdrCore("este telefone está na lista de bloqueio", 409);

  const desde = inicioDoDia(AGORA());
  const aberturas = await prisma.sdrInteracao.findMany({ where: { tenantId, tipo: "ABORDAGEM", canal: "WHATSAPP", resultado: { startsWith: PREFIXO_ABERTURA }, createdAt: { gte: desde } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (aberturas.length >= limites.limiteDiario) throw new ErroSdrCore(`o limite de ${limites.limiteDiario} conversas novas por dia no WhatsApp foi atingido; continue amanhã`, 429);
  const ultima = aberturas[0]?.createdAt;
  if (ultima) {
    const faltam = Math.ceil(limites.intervaloMinimoSegundos - (Date.now() - ultima.getTime()) / 1000);
    if (faltam > 0) throw new ErroSdrCore(`aguarde ${faltam}s antes de abrir a próxima conversa: o intervalo evita rajada de mensagens`, 429);
  }

  await prisma.sdrInteracao.create({
    data: { tenantId, empresaId: a.empresaId, tipo: "ABORDAGEM", canal: "WHATSAPP", abordagemId, resultado: `${PREFIXO_ABERTURA}, aguardando você confirmar o envio`, autorId: autor.id, autorNome: autor.name },
  });
  const nome = (empresa.nomeFantasia ?? empresa.razaoSocial ?? "").slice(0, 120);
  const url = `/abrir-conversa?telefone=${telefone}&nome=${encodeURIComponent(nome)}&mensagem=${encodeURIComponent(a.textoAprovado!.slice(0, 4000))}`;
  return { url, telefone, restantesHoje: limites.limiteDiario - aberturas.length - 1 };
}
