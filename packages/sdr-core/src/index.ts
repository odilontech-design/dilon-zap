import { empresasDoTenantFacade } from "./fachada";

export { ErroSdrCore } from "./erros";
export { LIMITES, esperaEntreTentativasMs } from "./limites";
export { lerCsv, detectarDelimitador } from "./csv";
export { CAMPOS, ROTULO_CAMPO, cnpjValido, normalizarCnpj, formatarCnpj, normalizarLinha, tituloDoNome, chaveDoNome } from "./normalizacao";
export type { Campo, EmpresaNormalizada } from "./normalizacao";
export { sugerirMapeamento, validarMapeamento } from "./mapeamento";
export type { Mapeamento } from "./mapeamento";
export { IndiceDeEmpresas, mesclarPreenchendoVazios } from "./dedup";
export { qualificar } from "./qualificacao";
export type { CriterioAvaliado, ResultadoQualificacao } from "./qualificacao";
export { podeProspectar, bloqueiosDaEmpresa, ROTULO_MOTIVO } from "./supressao";
export type { TipoSupressao, MotivoSupressao } from "./supressao";
export { enfileirar, reivindicar, renovarReserva, concluir, falhar, devolver, falharEsgotados } from "./fila";
export { processarProximoTrabalho } from "./trabalhos";
export type { OpcoesDoCiclo, ResultadoDoCiclo } from "./trabalhos";
export { analisarArquivo, previa, criarImportacao, processarImportacao, reprocessarImportacao } from "./importacao";
export { PREFIXO_AVISO_TELEFONE_DESCARTADO } from "./painel";
export type { Indicadores, Destaque } from "./painel";
export { motivoDoVerificar } from "./empresas";
export { associarEmpresas, requalificarCampanha, processarQualificacao } from "./prospectos";

/** Tudo do SDR que lê ou grava dados, preso a uma organização. O tenant nunca é argumento dos métodos. */
export const sdrDoTenant = empresasDoTenantFacade;

export { configIaSchema, CONFIG_PADRAO } from "./ia/config";
export type { ConfigIa } from "./ia/config";
export { executarTarefaIa, extrairJson } from "./ia/executar";
export type { PedidoDeTarefaIa, ResultadoDeTarefaIa, MotivoDaRecusa } from "./ia/executar";
export { provedorAnthropic, provedorGemini, provedoresPadrao, chaveAnthropicDoServidor } from "./ia/provedores";
export type { Provedor, Provedores } from "./ia/provedores";

export { acompanhamentoSchema, empresaEditavelSchema, novaAbordagemSchema, edicaoDeAbordagemSchema, contatoSchema, resultadoSchema, modeloNeutro, NOME_DO_PRODUTO, TAREFA_DE_ABORDAGEM, ETAPAS, ETAPAS_DE_RESULTADO } from "./comercial";
export type { EtapaComercial, VisaoDaCentral, Produto, Prioridade } from "./consulta";

export { RODAPE_DE_DESCADASTRO, corpoDoEmail, envioDeEmailSchema } from "./canais";
export type { EnviadorDeEmail, MensagemDeEmail, LimitesDoWhatsapp } from "./canais";

export { filtroDaFilaSchema, preparoSchema, resultadoEmLoteSchema, ETAPAS_EM_LOTE, FILA_PADRAO, FILA_MAXIMA } from "./fila-diaria";
export type { EstadoNaFila } from "./fila-diaria";
