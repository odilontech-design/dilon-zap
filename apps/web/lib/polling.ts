/**
 * Intervalos de atualização automática das telas, em milissegundos.
 *
 * Centralizado aqui porque esses números são o principal fator de custo de
 * tráfego do sistema: cada aba aberta refaz essas consultas o dia inteiro, e
 * o total vira gigabytes por dia (foi o que estourou a cota do banco em
 * 07/08/2026). Ao mexer, lembre que o custo é por aba aberta × horas de
 * expediente × número de atendentes.
 *
 * Regra prática: quanto mais perto do que o atendente está olhando naquele
 * segundo, mais rápido; o resto pode ser lento sem ninguém perceber.
 *
 * O SWR já pausa o polling quando a aba está em segundo plano e revalida
 * sozinho quando ela volta ao foco — então intervalo maior não significa
 * "dado velho ao voltar pra tela".
 */

/** Conversa aberta na tela — é onde o atendente espera ver a resposta chegar. */
export const MESSAGES_INTERVAL = 3_000;

/** Lista de conversas do Inbox. */
export const CONVERSATION_LIST_INTERVAL = 5_000;

/** Contagem global de não lidas — só alimenta o som de notificação. */
export const UNREAD_COUNT_INTERVAL = 10_000;

/** Números nas abas (Ativos/Pendentes/Resolvidos). */
export const STATUS_COUNTS_INTERVAL = 15_000;

/** Painel ao vivo e Funil — visão gerencial, não exige tempo real. */
export const DASHBOARD_INTERVAL = 15_000;

/** Listagens grandes que se navega com calma (Contatos, Funil, Relatórios). */
export const LISTING_INTERVAL = 30_000;

/** Painel /admin da Dilon Tech — uso esporádico. */
export const ADMIN_INTERVAL = 30_000;

/** Status da conexão WhatsApp — precisa ser vivo só enquanto espera o QR. */
export const WHATSAPP_STATUS_INTERVAL = 3_000;

/**
 * Aviso no Inbox de que o número está fora do ar.
 *
 * Bem mais lento que o WHATSAPP_STATUS_INTERVAL acima porque o uso é outro:
 * lá alguém está parado na tela esperando o QR aparecer; aqui é um aviso de
 * fundo, e a atendente não precisa saber no mesmo segundo. Vinte segundos de
 * atraso num aviso é irrelevante perto de descobrir só quando o cliente
 * reclama — que é o que acontecia antes.
 */
export const SESSION_HEALTH_INTERVAL = 20_000;
