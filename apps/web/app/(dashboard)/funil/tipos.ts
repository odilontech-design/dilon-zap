import type { Indicadores } from "@/lib/funil-indicadores";

export type TipoTarefa = "LIGACAO" | "WHATSAPP" | "REUNIAO" | "EMAIL" | "TAREFA";

export const ROTULO_TAREFA: Record<TipoTarefa, string> = {
  LIGACAO: "Ligação",
  WHATSAPP: "WhatsApp",
  REUNIAO: "Reunião",
  EMAIL: "E-mail",
  TAREFA: "Tarefa",
};

export type Etapa = { id: string; nome: string; cor: string; position: number; probabilidade: number };
export type Usuario = { id: string; name: string };
export type Motivo = { id: string; nome: string; ativo: boolean };

export type Negociacao = {
  id: string;
  titulo: string;
  stageId: string;
  status: "ABERTA" | "GANHA" | "PERDIDA";
  valorCents: number;
  recorrencia: "UNICA" | "MENSAL";
  origem: string | null;
  previsaoFechamento: string | null;
  etapaDesde: string;
  createdAt: string;
  fechadaEm: string | null;
  motivoPerdaId: string | null;
  proximaTarefa: { titulo: string; tipo: TipoTarefa; venceEm: string } | null;
  tarefasAtrasadas: number;
  contato: { id: string; nome: string | null; telefone: string | null; avatarUrl: string | null };
  responsavel: { id: string; name: string } | null;
};

export type Quadro = {
  funil: { id: string; nome: string };
  etapas: Etapa[];
  negociacoes: Negociacao[];
  indicadores: Indicadores;
  origens: string[];
  motivos: Motivo[];
  usuarios: Usuario[];
};

export type FunilResumo = { id: string; nome: string; padrao: boolean; etapas: number; abertas: number };

export const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function diasParada(n: Pick<Negociacao, "etapaDesde">, agora = Date.now()): number {
  return Math.max(0, Math.floor((agora - new Date(n.etapaDesde).getTime()) / 86_400_000));
}

/** "1.234,56" ou "1234.56" digitado → centavos. null se não for número. */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, "");
  if (!limpo) return 0;
  // Com vírgula, o ponto é separador de milhar ("1.234,56"); sem vírgula, o
  // ponto é decimal ("1234.56").
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normal);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
