import { prisma } from "@dilon-zap/db";
import { logAudit } from "@/lib/audit";
import { criarNegociacao } from "@/lib/negociacoes";
import { espelharNoCrm } from "@/lib/sdr/crm";
import { rotaSdr } from "@/lib/sdr/rota";
import { criarEnviadorSmtp, limitesDoSdr } from "@/lib/sdr/smtp";

/**
 * Envia por e-mail uma abordagem APROVADA, pela caixa SMTP configurada no servidor, a pedido de quem clicou em
 * "Enviar". Um envio por abordagem, versão e destinatário; limite diário; bloqueios respeitados. Ao enviar, registra o
 * contato e leva tudo para o CRM.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(
    req,
    "escrever",
    async (a, corpo) => {
      const r = await a.sdr.comercial.enviarEmail(params.id, corpo, a.user, criarEnviadorSmtp(), limitesDoSdr().emailPorDia);
      // Só o destinatário e o assunto vão para a auditoria, nunca o texto.
      await logAudit({ actor: a.user, action: "sdr.email.enviado", metadata: { abordagemId: params.id, envioId: r.envioId, para: r.para } });
      const ficha = await a.sdr.comercial.ficha(r.empresaId);
      const crm = await espelharNoCrm(
        { acesso: a, empresaId: r.empresaId, prisma, criarNegociacao },
        { tipo: "CONTATO", canal: "EMAIL", resultado: `e-mail enviado pelo sistema para ${r.para}`, assunto: r.assunto, texto: r.interacao.texto ?? "", proximaAcao: ficha.acompanhamento.proximaAcao, proximaAcaoEm: ficha.acompanhamento.proximaAcaoEm }
      );
      return { enviado: true, para: r.para, assunto: r.assunto, crm };
    },
    201
  );
}
