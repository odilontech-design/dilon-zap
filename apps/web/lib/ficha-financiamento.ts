import { hkdfSync } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { cifrar, decifrar } from "@dilon-zap/portais";
import { registrarFinanciamentoDoSite } from "@/lib/lead-site";
import type { LojaPublica } from "@/lib/vitrine";
import { conferirFicha, configDaFicha, dinheiroEmCentavos, type ConfigFicha, type DadosDaFicha } from "@/lib/ficha-campos";

/**
 * Ficha de financiamento do site (Meu site > Páginas > Financiamento), no jeito do AutoCerto.
 *
 * Pede CPF, renda, referências e conta bancária: dados que a LGPD trata com cuidado. Por isso:
 * - tudo o que o cliente preenche fica cifrado (AES-256-GCM) em FichaFinanciamento.dados; a
 *   negociação, a tarefa e o contato só levam nome, WhatsApp, carro e entrada;
 * - o cliente marca que autoriza o uso para análise de crédito (fica guardado com a data);
 * - cada abertura da ficha vai para a auditoria; a gestão pode apagar;
 * - a ficha se apaga sozinha em 180 dias.
 *
 * A chave é FICHAS_CHAVE (32 bytes em base64) ou, sem ela, uma derivada de PORTAIS_CHAVE
 * (HKDF, rótulo próprio). Sem nenhuma das duas, o site volta para o formulário curto.
 */

export const DIAS_GUARDADA = 180;

export function chaveDasFichas(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const propria = env.FICHAS_CHAVE ? Buffer.from(env.FICHAS_CHAVE, "base64") : null;
  if (propria?.length === 32) return propria;
  const base = env.PORTAIS_CHAVE ? Buffer.from(env.PORTAIS_CHAVE, "base64") : null;
  if (base?.length !== 32) return null;
  return Buffer.from(hkdfSync("sha256", base, Buffer.alloc(0), "dilon-zap/ficha-financiamento/v1", 32));
}

/** A configuração da ficha da loja. A ficha completa só vale com a chave configurada no servidor. */
export async function fichaDaLoja(tenantId: string): Promise<ConfigFicha & { semChave: boolean }> {
  const cfg = await prisma.veiculosConfig.findUnique({ where: { tenantId }, select: { fichaFinanciamento: true } });
  const c = configDaFicha(cfg?.fichaFinanciamento);
  const semChave = !chaveDasFichas();
  return { ...c, completa: c.completa && !semChave, semChave };
}

export async function salvarConfigDaFicha(tenantId: string, c: Partial<ConfigFicha>) {
  const atual = await prisma.veiculosConfig.findUnique({ where: { tenantId }, select: { fichaFinanciamento: true } });
  const nova = configDaFicha({ ...configDaFicha(atual?.fichaFinanciamento), ...c });
  await prisma.veiculosConfig.upsert({ where: { tenantId }, create: { tenantId, fichaFinanciamento: nova }, update: { fichaFinanciamento: nova } });
  return nova;
}

/** Apaga as fichas vencidas (de todas as lojas). Barato: roda a cada ficha nova e a cada leitura. */
export async function apagarFichasVencidas(agora = new Date()) {
  return (await prisma.fichaFinanciamento.deleteMany({ where: { apagarEm: { lt: agora } } })).count;
}

/** Recebe a ficha do site: confere, abre a negociação (sem dados sensíveis) e guarda a ficha cifrada. */
export async function registrarFichaDoSite(input: { loja: LojaPublica; ficha: unknown; consentimento: boolean; agora?: Date }): Promise<{ ok: true; negociacaoId: string } | { ok: false; erro: string }> {
  const agora = input.agora ?? new Date();
  const config = await fichaDaLoja(input.loja.tenantId);
  if (!config.completa) return { ok: false, erro: "esta loja não recebe a ficha completa pelo site" };
  if (!input.consentimento) return { ok: false, erro: "para enviar, autorize o uso dos dados para a análise de crédito" };
  const chave = chaveDasFichas();
  if (!chave) return { ok: false, erro: "esta loja não recebe a ficha completa pelo site" };
  const r = conferirFicha(config, input.ficha);
  if (!r.ok) return r;
  const d = r.dados;
  const telefone = d.pessoais.telefone.replace(/\D/g, "");
  const tel = telefone.length === 10 || telefone.length === 11 ? `55${telefone}` : telefone;

  let veiculoId: string | null = null;
  if (d.veiculo?.veiculoId) {
    const v = await prisma.veiculo.findFirst({ where: { id: d.veiculo.veiculoId, tenantId: input.loja.tenantId }, select: { id: true } });
    veiculoId = v?.id ?? null;
    if (!v) delete d.veiculo.veiculoId;
  }
  const { negociacaoId } = await registrarFinanciamentoDoSite({
    loja: input.loja,
    nome: d.pessoais.nome,
    telefone: tel,
    veiculoId,
    entradaCents: dinheiroEmCentavos(d.veiculo?.entrada),
    mensagem: "ficha completa recebida: veja na negociação",
  });
  const guardado: DadosDaFicha & { consentimentoEm: string } = { ...d, consentimentoEm: agora.toISOString() };
  await prisma.fichaFinanciamento.create({
    data: { tenantId: input.loja.tenantId, negociacaoId, secoes: r.secoes, dados: cifrar(JSON.stringify(guardado), chave), apagarEm: new Date(agora.getTime() + DIAS_GUARDADA * 86_400_000) },
  });
  await apagarFichasVencidas(agora).catch(() => 0);
  return { ok: true, negociacaoId };
}

/** As fichas de uma negociação, sem os dados (só quando chegou e até quando fica guardada). */
export async function fichasDaNegociacao(tenantId: string, negociacaoId: string) {
  await apagarFichasVencidas().catch(() => 0);
  return prisma.fichaFinanciamento.findMany({ where: { tenantId, negociacaoId }, orderBy: { createdAt: "desc" }, select: { id: true, secoes: true, createdAt: true, apagarEm: true } });
}

/** Abre uma ficha (decifrada). Quem chama registra na auditoria. */
export async function abrirFicha(tenantId: string, negociacaoId: string, id: string): Promise<(DadosDaFicha & { consentimentoEm?: string; veiculoNome?: string | null }) | null> {
  const f = await prisma.fichaFinanciamento.findFirst({ where: { id, tenantId, negociacaoId, apagarEm: { gt: new Date() } } });
  const chave = chaveDasFichas();
  if (!f || !chave) return null;
  let dados: DadosDaFicha & { consentimentoEm?: string };
  try {
    dados = JSON.parse(decifrar(f.dados, chave));
  } catch {
    return null; // chave trocada no servidor: a ficha não é mais legível
  }
  let veiculoNome: string | null = null;
  if (dados.veiculo?.veiculoId) {
    const v = await prisma.veiculo.findFirst({ where: { id: dados.veiculo.veiculoId, tenantId }, select: { marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, cor: true, precoCents: true } });
    if (v) veiculoNome = `${v.marca} ${v.modelo}${v.versao ? ` ${v.versao}` : ""} ${v.anoFabricacao}/${v.anoModelo}${v.cor ? ` · ${v.cor}` : ""} · ${(v.precoCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
  }
  return { ...dados, veiculoNome };
}

export async function apagarFicha(tenantId: string, negociacaoId: string, id: string): Promise<boolean> {
  return (await prisma.fichaFinanciamento.deleteMany({ where: { id, tenantId, negociacaoId } })).count > 0;
}
