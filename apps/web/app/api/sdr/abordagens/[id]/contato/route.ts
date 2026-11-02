import { logAudit } from "@/lib/audit";
import { rotaSdr } from "@/lib/sdr/rota";

/**
 * "Eu fiz este contato." O sistema NÃO envia nada: só registra, no horário e canal informados, que a pessoa
 * contatou a empresa com a abordagem aprovada. Exige o texto idêntico ao aprovado.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return rotaSdr(
    req,
    "escrever",
    async (a, corpo) => {
      const r = await a.sdr.comercial.registrarContato(params.id, corpo, a.user);
      if (!r.repetido) await logAudit({ actor: a.user, action: "sdr.contato.registrado", metadata: { abordagemId: params.id, interacaoId: r.interacao.id, canal: r.interacao.canal } });
      return r;
    },
    201
  );
}
