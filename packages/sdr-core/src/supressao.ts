import { prisma, Prisma } from "@dilon-zap/db";
import { ErroSdrCore } from "./erros";
import { LIMITES } from "./limites";
import { DOMINIOS_GENERICOS, normalizarCnpj, normalizarEmail, normalizarTelefone, type EmpresaNormalizada } from "./normalizacao";

/**
 * Lista de supressão: quem nunca deve ser prospectado. Consultada antes de
 * qualquer etapa de contato. O sistema só consulta e registra; não há contato
 * nesta etapa.
 */

export type TipoSupressao = "CNPJ" | "DOMINIO" | "EMAIL" | "TELEFONE";
export type MotivoSupressao = "EMPRESA_BLOQUEADA" | "SOLICITOU_NAO_CONTATO" | "OPOSICAO" | "RESTRICAO";

export const ROTULO_MOTIVO: Record<MotivoSupressao, string> = {
  EMPRESA_BLOQUEADA: "Empresa bloqueada",
  SOLICITOU_NAO_CONTATO: "Pediu para não ser contatada",
  OPOSICAO: "Oposição ao tratamento",
  RESTRICAO: "Restrição aplicável",
};

export type ListasDeSupressao = Record<TipoSupressao, Map<string, MotivoSupressao>>;
export type BloqueioEncontrado = { tipo: TipoSupressao; valor: string; motivo: MotivoSupressao };

/** Normaliza o valor pelo tipo. Devolve o texto pronto para guardar ou o erro para mostrar. */
export function normalizarValorDeSupressao(tipo: TipoSupressao, bruto: string): { valor: string } | { erro: string } {
  const texto = bruto.trim();
  if (tipo === "CNPJ") {
    const r = normalizarCnpj(texto);
    return "erro" in r ? { erro: r.erro } : { valor: r.cnpj };
  }
  if (tipo === "EMAIL") {
    const r = normalizarEmail(texto);
    return r.valor ? { valor: r.valor } : { erro: "e-mail inválido" };
  }
  if (tipo === "TELEFONE") {
    const r = normalizarTelefone(texto);
    return r.valor ? { valor: r.valor } : { erro: "telefone inválido" };
  }
  const dominio = texto.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dominio)) return { erro: "domínio inválido" };
  if (DOMINIOS_GENERICOS.has(dominio)) return { erro: "este é um provedor de e-mail comum: bloqueie o endereço, não o domínio" };
  return { valor: dominio };
}

/** Quais regras da lista batem com a empresa. Vazio = pode seguir. */
export function bloqueiosDaEmpresa(
  empresa: Pick<EmpresaNormalizada, "cnpj" | "dominio" | "emailDominio" | "email" | "telefone">,
  listas: ListasDeSupressao
): BloqueioEncontrado[] {
  const achados: BloqueioEncontrado[] = [];
  const checar = (tipo: TipoSupressao, valor: string | null) => {
    if (!valor) return;
    const motivo = listas[tipo].get(valor);
    if (motivo && !achados.some((a) => a.tipo === tipo && a.valor === valor)) achados.push({ tipo, valor, motivo });
  };
  checar("CNPJ", empresa.cnpj);
  checar("DOMINIO", empresa.dominio);
  checar("DOMINIO", empresa.emailDominio);
  checar("EMAIL", empresa.email);
  checar("TELEFONE", empresa.telefone);
  return achados;
}

export async function carregarListas(tenantId: string, tx: Prisma.TransactionClient | typeof prisma = prisma): Promise<ListasDeSupressao> {
  const listas: ListasDeSupressao = { CNPJ: new Map(), DOMINIO: new Map(), EMAIL: new Map(), TELEFONE: new Map() };
  const linhas = await tx.sdrSupressao.findMany({ where: { tenantId }, select: { tipo: true, valor: true, motivo: true } });
  for (const l of linhas) listas[l.tipo].set(l.valor, l.motivo);
  return listas;
}

/**
 * A consulta que toda etapa de contato deve fazer antes de falar com alguém.
 * Lê a empresa do tenant informado; empresa de outro tenant não existe aqui.
 */
export async function podeProspectar(
  tenantId: string,
  empresaId: string
): Promise<{ permitido: boolean; motivos: BloqueioEncontrado[] }> {
  const empresa = await prisma.sdrEmpresa.findFirst({ where: { id: empresaId, tenantId } });
  if (!empresa) throw new ErroSdrCore("empresa não encontrada", 404);
  const motivos = bloqueiosDaEmpresa(empresa, await carregarListas(tenantId));
  return { permitido: motivos.length === 0, motivos };
}

/** Filtro Prisma das empresas que batem com a lista, para a tela de bloqueadas. */
export function filtroDeEmpresasSuprimidas(listas: ListasDeSupressao): Prisma.SdrEmpresaWhereInput {
  const ou: Prisma.SdrEmpresaWhereInput[] = [];
  if (listas.CNPJ.size) ou.push({ cnpj: { in: [...listas.CNPJ.keys()] } });
  if (listas.DOMINIO.size) {
    ou.push({ dominio: { in: [...listas.DOMINIO.keys()] } }, { emailDominio: { in: [...listas.DOMINIO.keys()] } });
  }
  if (listas.EMAIL.size) ou.push({ email: { in: [...listas.EMAIL.keys()] } });
  if (listas.TELEFONE.size) ou.push({ telefone: { in: [...listas.TELEFONE.keys()] } });
  // Lista vazia: nenhuma empresa bate. `id in []` não devolve nada.
  return ou.length ? { OR: ou } : { id: { in: [] } };
}

/**
 * O contrário do filtro acima. Não dá para usar NOT em cima dele: com colunas
 * nulas, "NOT (campo IN (...))" vira NULL e a empresa some da lista em vez de
 * aparecer como não bloqueada. Aqui cada coluna aceita nulo de propósito.
 */
export function filtroDeEmpresasNaoSuprimidas(listas: ListasDeSupressao): Prisma.SdrEmpresaWhereInput {
  const naoEm = (campo: "cnpj" | "dominio" | "emailDominio" | "email" | "telefone", valores: string[]): Prisma.SdrEmpresaWhereInput[] =>
    valores.length ? [{ OR: [{ [campo]: null }, { [campo]: { notIn: valores } }] }] : [];
  const dominios = [...listas.DOMINIO.keys()];
  const todos = [
    ...naoEm("cnpj", [...listas.CNPJ.keys()]),
    ...naoEm("dominio", dominios),
    ...naoEm("emailDominio", dominios),
    ...naoEm("email", [...listas.EMAIL.keys()]),
    ...naoEm("telefone", [...listas.TELEFONE.keys()]),
  ];
  return todos.length ? { AND: todos } : {};
}

export type NovaSupressao = { tipo: TipoSupressao; valor: string; motivo: MotivoSupressao; observacao?: string | null };

export function supressoesDoTenant(tenantId: string) {
  return {
    listar: () => prisma.sdrSupressao.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),

    async criar(d: NovaSupressao, autor: { id: string; name: string }) {
      const normalizado = normalizarValorDeSupressao(d.tipo, d.valor);
      if ("erro" in normalizado) throw new ErroSdrCore(normalizado.erro, 400);
      if ((await prisma.sdrSupressao.count({ where: { tenantId } })) >= LIMITES.supressoesPorEmpresa) {
        throw new ErroSdrCore(`a lista de supressão chegou ao limite de ${LIMITES.supressoesPorEmpresa} registros`, 409);
      }
      try {
        return await prisma.sdrSupressao.create({
          data: {
            tenantId,
            tipo: d.tipo,
            valor: normalizado.valor,
            motivo: d.motivo,
            observacao: d.observacao?.trim() || null,
            criadoPorId: autor.id,
            criadoPorNome: autor.name,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ErroSdrCore("este item já está na lista de supressão", 409);
        throw e;
      }
    },

    async remover(id: string) {
      const { count } = await prisma.sdrSupressao.deleteMany({ where: { id, tenantId } });
      if (count === 0) throw new ErroSdrCore("registro de supressão não encontrado", 404);
    },

    carregarListas: () => carregarListas(tenantId),
    podeProspectar: (empresaId: string) => podeProspectar(tenantId, empresaId),
  };
}
