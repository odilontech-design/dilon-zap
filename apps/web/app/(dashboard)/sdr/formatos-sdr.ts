/**
 * Rótulos e formatos das telas do SDR. Fica separado de @dilon-zap/sdr-core de
 * propósito: aquele pacote fala com o banco e não pode ir para o navegador.
 */

export type StatusProspecto = "PENDENTE" | "QUALIFICADO" | "NAO_QUALIFICADO" | "VERIFICAR";

export const ROTULO_STATUS_PROSPECTO: Record<StatusProspecto, string> = {
  PENDENTE: "Aguardando",
  QUALIFICADO: "Qualificada",
  NAO_QUALIFICADO: "Não qualificada",
  VERIFICAR: "Verificar",
};

export const COR_STATUS_PROSPECTO: Record<StatusProspecto, string> = {
  PENDENTE: "bg-neutral-100 text-neutral-600",
  QUALIFICADO: "bg-accent/10 text-accent",
  NAO_QUALIFICADO: "bg-red-50 text-red-700",
  VERIFICAR: "bg-amber-100 text-amber-800",
};

export const ROTULO_STATUS_IMPORTACAO: Record<string, string> = {
  PENDENTE: "Na fila",
  PROCESSANDO: "Processando",
  CONCLUIDA: "Concluída",
  CONCLUIDA_COM_ERROS: "Concluída com erros",
  FALHOU: "Falhou",
};

export const COR_STATUS_IMPORTACAO: Record<string, string> = {
  PENDENTE: "bg-neutral-100 text-neutral-600",
  PROCESSANDO: "bg-blue-50 text-blue-700",
  CONCLUIDA: "bg-accent/10 text-accent",
  CONCLUIDA_COM_ERROS: "bg-amber-100 text-amber-800",
  FALHOU: "bg-red-50 text-red-700",
};

export const ROTULO_STATUS_LINHA: Record<string, string> = {
  PENDENTE: "Aguardando",
  IMPORTADA: "Nova",
  ATUALIZADA: "Atualizou campos vazios",
  DUPLICADA: "Duplicada",
  INVALIDA: "Inválida",
  FALHOU: "Falhou",
};

export const COR_STATUS_LINHA: Record<string, string> = {
  PENDENTE: "bg-neutral-100 text-neutral-600",
  IMPORTADA: "bg-accent/10 text-accent",
  ATUALIZADA: "bg-blue-50 text-blue-700",
  DUPLICADA: "bg-neutral-100 text-neutral-600",
  INVALIDA: "bg-red-50 text-red-700",
  FALHOU: "bg-red-50 text-red-700",
};

export const ROTULO_SITUACAO_CRITERIO: Record<string, string> = {
  ATENDIDO: "Atendido",
  NAO_ATENDIDO: "Não atendido",
  DESCONHECIDO: "Sem dado no CSV",
  NAO_VERIFICADO: "Não verificado",
};

export const COR_SITUACAO_CRITERIO: Record<string, string> = {
  ATENDIDO: "bg-accent/10 text-accent",
  NAO_ATENDIDO: "bg-red-50 text-red-700",
  DESCONHECIDO: "bg-amber-100 text-amber-800",
  NAO_VERIFICADO: "bg-neutral-100 text-neutral-600",
};

export const ROTULO_MOTIVO_SUPRESSAO: Record<string, string> = {
  EMPRESA_BLOQUEADA: "Empresa bloqueada",
  SOLICITOU_NAO_CONTATO: "Pediu para não ser contatada",
  OPOSICAO: "Oposição ao tratamento",
  RESTRICAO: "Restrição aplicável",
};

export const ROTULO_TIPO_SUPRESSAO: Record<string, string> = { CNPJ: "CNPJ", DOMINIO: "Domínio", EMAIL: "E-mail", TELEFONE: "Telefone" };

export const ROTULO_CRITERIO_DE_DUPLICIDADE: Record<string, string> = { CNPJ: "mesmo CNPJ", SITE: "mesmo site", NOME_UF: "mesmo nome e estado" };

export const ROTULO_CAMPO: Record<string, string> = {
  cnpj: "CNPJ", razaoSocial: "Razão social", nomeFantasia: "Nome fantasia", telefone: "Telefone", email: "E-mail", site: "Site",
  uf: "Estado (UF)", cidade: "Cidade", segmento: "Segmento", porte: "Porte", cnae: "CNAE",
};

export const CAMPOS_DO_ARQUIVO = ["cnpj", "razaoSocial", "nomeFantasia", "telefone", "email", "site", "uf", "cidade", "segmento", "porte", "cnae"] as const;

export const ROTULO_PORTE: Record<string, string> = { MEI: "MEI", ME: "Microempresa", EPP: "Pequeno porte", MEDIA: "Média", GRANDE: "Grande" };

export const formatarCnpj = (c: string | null) =>
  c && c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : (c ?? "");

/** 5511999998888 -> (11) 99999-8888 */
export function formatarTelefone(t: string | null): string {
  if (!t) return "";
  const d = t.startsWith("55") ? t.slice(2) : t;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export const dataHora = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

export const nomeDaEmpresa = (e: { razaoSocial: string | null; nomeFantasia: string | null }) => e.razaoSocial ?? e.nomeFantasia ?? "(sem nome)";

export const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm";
export const campoPequeno = "rounded-md border border-neutral-300 bg-surface px-2 py-1.5 text-sm";
export const rotulo = "block text-xs font-medium text-neutral-700 mb-1";
export const botaoPrimario = "rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
export const botaoSecundario = "rounded-md border border-neutral-300 px-3 py-2 text-sm hover:border-accent disabled:opacity-50";

export type EtapaComercial = "NAO_CONTATADA" | "CONTATADA" | "RESPONDEU" | "INTERESSE" | "INFO_SOLICITADA" | "REUNIAO" | "SEM_INTERESSE" | "NAO_CONTATAR" | "CONVERTIDA";

export const ROTULO_ETAPA: Record<EtapaComercial, string> = {
  NAO_CONTATADA: "Não contatada",
  CONTATADA: "Aguardando resposta",
  RESPONDEU: "Respondeu",
  INTERESSE: "Demonstrou interesse",
  INFO_SOLICITADA: "Solicitou informações",
  REUNIAO: "Solicitou reunião",
  SEM_INTERESSE: "Sem interesse",
  NAO_CONTATAR: "Não contatar novamente",
  CONVERTIDA: "No CRM",
};

export const COR_ETAPA: Record<EtapaComercial, string> = {
  NAO_CONTATADA: "bg-neutral-100 text-neutral-600",
  CONTATADA: "bg-blue-50 text-blue-700",
  RESPONDEU: "bg-accent/10 text-accent",
  INTERESSE: "bg-accent/10 text-accent",
  INFO_SOLICITADA: "bg-accent/10 text-accent",
  REUNIAO: "bg-accent/10 text-accent",
  SEM_INTERESSE: "bg-neutral-200 text-neutral-500",
  NAO_CONTATAR: "bg-red-50 text-red-700",
  CONVERTIDA: "bg-accent text-white",
};

/** As escolhas do registro de resposta, na ordem em que a pessoa pensa. */
export const ETAPAS_DE_RESPOSTA: EtapaComercial[] = ["CONTATADA", "RESPONDEU", "INTERESSE", "INFO_SOLICITADA", "REUNIAO", "SEM_INTERESSE", "NAO_CONTATAR"];
export const ETAPAS_COM_INTERESSE: EtapaComercial[] = ["INTERESSE", "INFO_SOLICITADA", "REUNIAO"];

export const ROTULO_PRODUTO: Record<string, string> = { DILON_ZAP: "Dilon Zap", DILON_FACILITIES: "Dilon Facilities" };
export const ROTULO_PRIORIDADE: Record<string, string> = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };
export const ROTULO_CANAL: Record<string, string> = { EMAIL: "E-mail", LIGACAO: "Ligação", WHATSAPP: "WhatsApp", MENSAGEM: "Mensagem profissional", OUTRO: "Outro canal" };
export const ROTULO_FINALIDADE: Record<string, string> = { PRIMEIRO_CONTATO: "Primeiro contato", FOLLOW_UP: "Follow-up", ROTEIRO: "Roteiro" };
export const ROTULO_TIPO_INTERACAO: Record<string, string> = { CONTATO: "Contato realizado", RESPOSTA: "Resposta", NOTA: "Nota", DECISOR: "Decisor", ETAPA: "Situação", ABORDAGEM: "Abordagem", CRM: "CRM" };

/** Datas de follow-up são dias de Brasília. Guardadas ao meio-dia, para nenhum fuso empurrar para o dia vizinho. */
export const dataParaIso = (aaaaMmDd: string) => `${aaaaMmDd}T12:00:00-03:00`;
export const isoParaData = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10) : "");
export const dataCurta = (iso: string | null | undefined) => (iso ? isoParaData(iso).split("-").reverse().join("/") : "—");
export const hojeEmBrasilia = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
export const maisDias = (dias: number) => new Date(Date.now() - 3 * 3_600_000 + dias * 86_400_000).toISOString().slice(0, 10);
