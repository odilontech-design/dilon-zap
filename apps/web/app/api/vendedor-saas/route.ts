import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";
import { listarConversasDoVendedor, obterConfigDoVendedor, salvarConfigDoVendedor } from "@dilon-zap/vendedor-ia/src/saas/vendedor";

/**
 * O vendedor de SaaS do SDR: configuração e conversas. Fica fora de /api/sdr de propósito: o SDR em si nunca toca em
 * conversa nem mensagem do WhatsApp (guardas nos testes), e o vendedor é o único que grava mensagem, num pacote à parte.
 * O acesso é o do SDR: o recurso ligado na empresa da sessão e o papel de quem pode ler ou escrever.
 */
export async function GET() {
  return rotaSdr(null, "ler", async (a) => {
    const [configuracao, conversas] = await Promise.all([obterConfigDoVendedor(a.user.tenantId), listarConversasDoVendedor(a.user.tenantId)]);
    return { configuracao, ...conversas, podeEscrever: a.podeEscrever };
  });
}

export async function PUT(req: Request) {
  return rotaSdr(req, "escrever", async (a, corpo) => {
    const salva = await salvarConfigDoVendedor(a.user.tenantId, corpo, a.user);
    await logAudit({ actor: a.user, action: "sdr.vendedor.configurado", metadata: { ativo: salva.ativo, modo: salva.modo, limiteTurnos: salva.limiteTurnos } });
    return salva;
  });
}
