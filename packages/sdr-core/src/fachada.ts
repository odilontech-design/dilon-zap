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
    supressoes: supressoesDoTenant(tenantId),
  };
}
