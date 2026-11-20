import { prisma } from "@dilon-zap/db";
import { NOME_DO_PORTAL } from "@/lib/lead-portal";

/** Dados da central de leads: o endereço de entrada, os leads dos portais com o tempo de espera e os e-mails que não entendemos. */
export async function painelCentralDeLeads(tenantId: string, urlBase: string) {
  const config = await prisma.veiculosConfig.findUnique({ where: { tenantId }, select: { leadEmailToken: true, distribuirLeads: true } });
  const desde = new Date(Date.now() - 30 * 86_400_000);
  const [leads, aguardando, total30d, emails] = await Promise.all([
    prisma.leadPortal.findMany({
      where: { tenantId, recebidoEm: { gte: desde } },
      orderBy: { recebidoEm: "desc" },
      take: 30,
      select: { id: true, portal: true, nome: true, telefone: true, email: true, mensagem: true, semTelefone: true, recebidoEm: true, respondidoEm: true, veiculoId: true, negociacaoId: true },
    }),
    prisma.leadPortal.count({ where: { tenantId, respondidoEm: null, recebidoEm: { gte: desde } } }),
    prisma.leadPortal.count({ where: { tenantId, recebidoEm: { gte: desde } } }),
    prisma.emailDeLead.findMany({
      where: { tenantId, situacao: { in: ["NAO_ENTENDIDO", "ERRO"] } },
      orderBy: { recebidoEm: "desc" },
      take: 10,
      select: { id: true, de: true, assunto: true, motivo: true, situacao: true, recebidoEm: true },
    }),
  ]);
  const ids = [...new Set(leads.map((l) => l.veiculoId).filter((v): v is string => !!v))];
  const carros = new Map((await prisma.veiculo.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, marca: true, modelo: true, anoModelo: true } })).map((c) => [c.id, c]));
  return {
    endereco: config?.leadEmailToken ? `${urlBase.replace(/\/$/, "")}/api/leads/email/${config.leadEmailToken}` : null,
    distribuirLeads: config?.distribuirLeads ?? false,
    total30d,
    aguardando,
    leads: leads.map((l) => ({ ...l, portalNome: NOME_DO_PORTAL[l.portal], veiculo: l.veiculoId ? carros.get(l.veiculoId) ?? null : null })),
    emailsSemLeitura: emails,
  };
}
