import { NextResponse } from "next/server";
import { configIaSchema } from "@dilon-zap/sdr-core";
import { logAudit } from "@/lib/audit";
import { dadosInvalidos, lerJson, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";

/** Configuração e uso da IA do SDR. Nenhuma chave passa por aqui: elas só existem no servidor. */
export async function GET() {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);
  try {
    const [configuracao, uso] = await Promise.all([acesso.sdr.ia.configuracao(), acesso.sdr.ia.uso()]);
    return NextResponse.json({ configuracao, uso, podeEscrever: acesso.podeEscrever });
  } catch (e) {
    return respostaDeErro(e);
  }
}

export async function PUT(req: Request) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);

  const corpo = await lerJson(req, 256 * 1024);
  if (!corpo.ok) return corpo.resposta;
  const parsed = configIaSchema.safeParse(corpo.dados);
  if (!parsed.success) return dadosInvalidos();
  try {
    const salva = await acesso.sdr.ia.salvarConfiguracao(parsed.data, acesso.user);
    await logAudit({
      actor: acesso.user,
      action: "sdr.ia.configurada",
      metadata: { ativa: salva.ativa, orcamentoDiarioMicro: salva.orcamentoDiarioMicro, orcamentoMensalMicro: salva.orcamentoMensalMicro, tarefas: Object.keys(salva.modelos) },
    });
    return NextResponse.json(salva);
  } catch (e) {
    return respostaDeErro(e);
  }
}
