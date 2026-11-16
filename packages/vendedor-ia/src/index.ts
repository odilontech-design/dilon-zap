export { PRECOS, MODELO_PADRAO, PREMISSAS_PADRAO, custoMicros, estimarCustoPorLead, custoMensalReais, type Premissas, type EstimativaLead } from "./custo";
export { fichaParaCliente, nomeDoVeiculo } from "./ficha";
export { ciclo, atenderConversa, usoDoMes, type Dependencias, type ClienteIa } from "./executar";

// Vendedor de SaaS do SDR (responde quem respondeu a uma abordagem). Mora aqui, e não no núcleo do SDR, porque grava mensagens
// do WhatsApp: o SDR em si nunca toca em conversa nem mensagem.
export { cicloDoVendedor, obterConfigDoVendedor, salvarConfigDoVendedor, listarConversasDoVendedor, enviarSugestao, descartarSugestao, configDoVendedorSchema, edicaoDaSugestaoSchema } from "./saas/vendedor";
export type { ConfigDoVendedor, DependenciasDoVendedor, ResultadoDoCicloDoVendedor } from "./saas/vendedor";
export { TAREFA_DO_VENDEDOR, ACOES_DO_VENDEDOR } from "./saas/prompt";
