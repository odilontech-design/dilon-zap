import { prisma } from "@dilon-zap/db";
import { avisarNoCelular, type AvisoPush } from "@/lib/push";
import { recursosDoTenant } from "@/lib/plano";

/**
 * Aviso (push) de mensagem nova do Instagram da loja, no celular e no computador. A caixa do Instagram é da
 * revenda toda (não há responsável por conversa), então o aviso vai para a equipe ativa da empresa que usa o
 * módulo de veículos. Uma rajada de mensagens da mesma conversa vira um aviso só por minuto: quem manda "oi",
 * "tudo bem?" e "queria saber..." em três linhas não pode fazer o celular vibrar três vezes.
 * Best-effort: falhar em avisar nunca atrapalha o recebimento da mensagem.
 */

const JANELA_MS = 60_000;
const ultimoAviso = new Map<string, number>();

function limparAntigos(agora: number) {
  if (ultimoAviso.size < 5_000) return;
  for (const [k, t] of ultimoAviso) if (agora - t > JANELA_MS) ultimoAviso.delete(k);
}

/** O que o cliente escreveu, curto; foto, vídeo e áudio já chegam como "[foto]" etc. no texto. */
export function corpoDoAvisoInstagram(texto: string): string {
  const t = texto.trim().replace(/\s+/g, " ");
  if (!t) return "Nova mensagem";
  return t.length > 140 ? `${t.slice(0, 139)}…` : t;
}

export function tituloDoAvisoInstagram(nome: string | null | undefined, username: string | null | undefined): string {
  const quem = nome?.trim() || (username ? `@${username}` : "Cliente");
  return `Instagram: ${quem}`;
}

/** Quem recebe: a equipe ativa (sem o suporte da Dilon Tech) de uma empresa com o módulo de veículos. */
export async function destinatariosDoAvisoInstagram(tenantId: string): Promise<string[]> {
  if (!(await recursosDoTenant(tenantId)).has("VEICULOS")) return [];
  return (await prisma.user.findMany({ where: { tenantId, deactivatedAt: null, role: { not: "SUPERADMIN" } }, select: { id: true } })).map((u) => u.id);
}

export async function avisarInstagramNovo(
  p: { tenantId: string; conversaId: string; nome: string | null; username: string | null; texto: string },
  enviar: (userId: string, aviso: AvisoPush) => Promise<void> = avisarNoCelular,
  agora = Date.now()
): Promise<number> {
  const ultimo = ultimoAviso.get(p.conversaId);
  if (ultimo !== undefined && agora - ultimo < JANELA_MS) return 0;
  ultimoAviso.set(p.conversaId, agora);
  limparAntigos(agora);
  const pessoas = await destinatariosDoAvisoInstagram(p.tenantId);
  const aviso: AvisoPush = { titulo: tituloDoAvisoInstagram(p.nome, p.username), corpo: corpoDoAvisoInstagram(p.texto), url: "/veiculos/instagram", tag: `instagram:${p.conversaId}` };
  await Promise.all(pessoas.map((id) => enviar(id, aviso).catch(() => {})));
  return pessoas.length;
}

/** Só para teste: esquece o que já foi avisado. */
export const esquecerAvisosInstagram = () => ultimoAviso.clear();
