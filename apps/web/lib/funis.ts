import { prisma } from "@dilon-zap/db";

/**
 * O funil padrão de uma empresa, criado na primeira necessidade.
 *
 * Antes havia um funil só, implícito: as etapas eram da empresa. Agora toda
 * etapa pertence a um funil, e este ponto único garante que o padrão exista e
 * ADOTA as etapas antigas que ainda não têm funil.
 *
 * Auto-cura de propósito, e não só um script de migração: se o código novo
 * subir antes do script rodar (ou o script nunca rodar numa empresa pequena),
 * a primeira abertura da tela já deixa tudo consistente, em vez de mostrar um
 * funil vazio por cima de etapas que existem.
 *
 * Idempotente. Duas requisições simultâneas podem tentar criar o padrão ao
 * mesmo tempo; o @@unique([tenantId, nome]) faz a segunda falhar, e ela só
 * relê o que a primeira criou.
 */
export const NOME_FUNIL_PADRAO = "Funil de vendas";

export async function garantirFunilPadrao(tenantId: string) {
  let padrao = await prisma.funil.findFirst({
    where: { tenantId, padrao: true, arquivadoEm: null },
    orderBy: { position: "asc" },
  });

  if (!padrao) {
    try {
      padrao = await prisma.funil.create({
        data: { tenantId, nome: NOME_FUNIL_PADRAO, padrao: true, position: 0 },
      });
    } catch {
      // Perdeu a corrida pra outra requisição: o funil já existe.
      padrao = await prisma.funil.findFirstOrThrow({
        where: { tenantId, nome: NOME_FUNIL_PADRAO },
      });
    }
  }

  // Etapas do tempo em que o funil era implícito.
  await prisma.stage.updateMany({
    where: { tenantId, funilId: null },
    data: { funilId: padrao.id },
  });

  return padrao;
}

/**
 * O funil pedido, conferido contra a empresa; ou o padrão.
 * Devolve null se o id existe mas é de outra empresa — quem chama responde
 * 404, nunca confirma que o funil de outro tenant existe.
 */
export async function funilDaEmpresa(tenantId: string, funilId: string | null | undefined) {
  if (!funilId) return garantirFunilPadrao(tenantId);
  return prisma.funil.findFirst({ where: { id: funilId, tenantId } });
}

/** Motivos de perda que toda empresa começa tendo. Editáveis depois. */
export const MOTIVOS_DE_PERDA_INICIAIS = [
  "Preço",
  "Sem resposta",
  "Escolheu um concorrente",
  "Sem orçamento",
  "Não era o momento",
  "Fora do perfil",
];

/** Cria a lista inicial se a empresa ainda não tem nenhum motivo. */
export async function garantirMotivosDePerda(tenantId: string) {
  const existentes = await prisma.motivoDePerda.count({ where: { tenantId } });
  if (existentes > 0) return;
  await prisma.motivoDePerda.createMany({
    data: MOTIVOS_DE_PERDA_INICIAIS.map((nome) => ({ tenantId, nome })),
    skipDuplicates: true,
  });
}
