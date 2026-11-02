import { listarEmpresas, obterEmpresa, type FiltroDeEmpresas } from "./empresas";
import {
  criarImportacao,
  listarImportacoes,
  listarLinhas,
  obterImportacao,
  previa,
  reprocessarImportacao,
  type FiltroDeLinhas,
  type NovaImportacao,
} from "./importacao";
import { indicadoresDoPainel, opcoesDeFiltro } from "./painel";
import type { FiltroDoPainel } from "./consulta";
import {
  aprovarAbordagem,
  criarAbordagem,
  editarAbordagem,
  editarEmpresa,
  gerarAbordagemComIa,
  marcarConvertida,
  meuComercialDeHoje,
  obterFichaComercial,
  registrarContato,
  registrarNota,
  registrarResultado,
  rejeitarAbordagem,
  salvarAcompanhamento,
  type PedidoDeAbordagemIa,
} from "./comercial";
import { obterConfigIa, salvarConfigIa, type ConfigIa } from "./ia/config";
import { executarTarefaIa, type OpcoesDeExecucao, type PedidoDeTarefaIa } from "./ia/executar";
import { resumoDeUsoIa } from "./ia/uso";
import { associarEmpresas, requalificarCampanha } from "./prospectos";
import { supressoesDoTenant } from "./supressao";

/**
 * A porta de entrada do SDR para as rotas. Nasce presa a um tenant, tirado da
 * sessão pela rota: nenhum método recebe tenantId, então não há como a rota
 * esquecê-lo nem trocá-lo.
 */
export function empresasDoTenantFacade(tenantId: string) {
  if (!tenantId) throw new Error("SDR sem tenant");
  return {
    importacoes: {
      previa: (conteudo: string, mapeamento?: Partial<Record<string, string | null>> | null) => previa(tenantId, conteudo, mapeamento),
      criar: (autor: { id: string; name: string }, d: NovaImportacao) => criarImportacao(tenantId, autor, d),
      listar: () => listarImportacoes(tenantId),
      obter: (id: string) => obterImportacao(tenantId, id),
      linhas: (id: string, filtro?: FiltroDeLinhas) => listarLinhas(tenantId, id, filtro),
      reprocessar: (id: string) => reprocessarImportacao(tenantId, id),
    },
    empresas: {
      listar: (filtro?: FiltroDeEmpresas) => listarEmpresas(tenantId, filtro),
      obter: (id: string) => obterEmpresa(tenantId, id),
      associarACampanha: (campanhaId: string, empresaIds: string[]) => associarEmpresas(tenantId, campanhaId, empresaIds),
      requalificarCampanha: (campanhaId: string) => requalificarCampanha(tenantId, campanhaId),
    },
    painel: {
      indicadores: (filtro?: FiltroDoPainel) => indicadoresDoPainel(tenantId, filtro),
      opcoes: () => opcoesDeFiltro(tenantId),
    },
    comercial: {
      hoje: () => meuComercialDeHoje(tenantId),
      ficha: (empresaId: string) => obterFichaComercial(tenantId, empresaId),
      salvar: (empresaId: string, dados: unknown, autor: { id: string; name: string }) => salvarAcompanhamento(tenantId, empresaId, dados, autor),
      editarEmpresa: (empresaId: string, dados: unknown) => editarEmpresa(tenantId, empresaId, dados),
      criarAbordagem: (empresaId: string, dados: unknown, autor: { id: string; name: string }) => criarAbordagem(tenantId, empresaId, dados, autor),
      gerarAbordagem: (empresaId: string, pedido: PedidoDeAbordagemIa, autor: { id: string; name: string }, opcoes?: OpcoesDeExecucao) => gerarAbordagemComIa(tenantId, empresaId, pedido, autor, opcoes),
      editarAbordagem: (id: string, dados: unknown, autor: { id: string; name: string }) => editarAbordagem(tenantId, id, dados, autor),
      aprovarAbordagem: (id: string, autor: { id: string; name: string }) => aprovarAbordagem(tenantId, id, autor),
      rejeitarAbordagem: (id: string, autor: { id: string; name: string }) => rejeitarAbordagem(tenantId, id, autor),
      registrarContato: (abordagemId: string, dados: unknown, autor: { id: string; name: string }) => registrarContato(tenantId, abordagemId, dados, autor),
      registrarResultado: (empresaId: string, dados: unknown, autor: { id: string; name: string }) => registrarResultado(tenantId, empresaId, dados, autor),
      registrarNota: (empresaId: string, texto: string, autor: { id: string; name: string }) => registrarNota(tenantId, empresaId, texto, autor),
      marcarConvertida: (empresaId: string, negociacaoId: string, autor: { id: string; name: string }) => marcarConvertida(tenantId, empresaId, negociacaoId, autor),
    },
    ia: {
      configuracao: () => obterConfigIa(tenantId),
      salvarConfiguracao: (dados: ConfigIa, autor: { id: string; name: string }) => salvarConfigIa(tenantId, dados, autor),
      uso: () => resumoDeUsoIa(tenantId),
      executar: <T>(pedido: Omit<PedidoDeTarefaIa<T>, "tenantId">, opcoes?: OpcoesDeExecucao) => executarTarefaIa<T>({ ...pedido, tenantId }, opcoes),
    },
    supressoes: supressoesDoTenant(tenantId),
  };
}
