import { prisma } from "@dilon-zap/db";
import { logAudit } from "@/lib/audit";
import { criarNegociacao } from "@/lib/negociacoes";
import { espelharNoCrm } from "@/lib/sdr/crm";
import { rotaSdr } from "@/lib/sdr/rota";

/**
 * "Eu fiz este contato." Para ligação, WhatsApp, mensagem ou e-mail que você mesmo enviou: o sistema NÃO envia nada,
 * só registra, no horário e canal informados, que a pessoa contatou a empresa com a abordagem aprovada (texto idêntico
 * ao aprovado). O primeiro contato também cria o contato e a negociação no CRM e deixa o follow-up como tarefa.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(
    req,
    "escrever",
    async (a, corpo) => {
      const r = await a.sdr.comercial.registrarContato(params.id, corpo, a.user);
      if (r.repetido) return { ...r, crm: null };
      await logAudit({ actor: a.user, action: "sdr.contato.registrado", metadata: { abordagemId: params.id, interacaoId: r.interacao.id, canal: r.interacao.canal } });
      const ficha = await a.sdr.comercial.ficha(r.interacao.empresaId);
      const crm = await espelharNoCrm(
        { acesso: a, empresaId: r.interacao.empresaId, prisma, criarNegociacao },
        { tipo: "CONTATO", canal: r.interacao.canal ?? "OUTRO", resultado: r.interacao.resultado, texto: r.interacao.texto ?? "", proximaAcao: ficha.acompanhamento.proximaAcao, proximaAcaoEm: ficha.acompanhamento.proximaAcaoEm }
      );
      return { ...r, crm };
    },
    201
  );
}
