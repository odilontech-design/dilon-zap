import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@dilon-zap/db";

/**
 * Chaves de API para sistemas externos (hoje, o Dilon Saúde).
 *
 * O valor em claro existe UMA vez, no momento em que é gerado. O banco guarda
 * só o hash — assim um dump do banco, um print da tela ou um log não entregam
 * a chave de ninguém.
 */

const PREFIXO = "dz_";

/** Gera uma chave nova. O valor em claro só é devolvido aqui, nunca mais. */
export function gerarChave() {
  const bruto = randomBytes(32).toString("base64url");
  const chave = PREFIXO + bruto;
  return { chave, hash: hashDaChave(chave), final: chave.slice(-6) };
}

/**
 * SHA-256 e não bcrypt de propósito.
 *
 * bcrypt é lento por desenho, o que é certo pra senha humana (protege contra
 * força bruta sobre algo curto e adivinhável). Uma chave destas tem 256 bits
 * de entropia aleatória: não há dicionário que a alcance, e o custo do bcrypt
 * apareceria em toda requisição da integração.
 */
export function hashDaChave(chave: string) {
  return createHash("sha256").update(chave).digest("hex");
}

export type TenantAutenticado = { tenantId: string; apiKeyId: string };

/**
 * Confere o header Authorization e devolve de qual empresa é a chave.
 *
 * Retorna null pra qualquer falha — ausente, malformada, desconhecida ou
 * revogada — sem dizer qual das quatro. Distinguir "chave não existe" de
 * "chave revogada" na resposta entregaria a quem está tentando adivinhar a
 * informação de que acertou o formato.
 */
export async function autenticarPorChave(req: Request): Promise<TenantAutenticado | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const chave = header.slice(7).trim();
  if (!chave.startsWith(PREFIXO) || chave.length < 20) return null;

  const registro = await prisma.apiKey.findUnique({
    where: { hash: hashDaChave(chave) },
    select: { id: true, tenantId: true, hash: true, revokedAt: true },
  });
  if (!registro || registro.revokedAt) return null;

  // A busca é por índice no hash, então o registro certo já foi encontrado.
  // A comparação em tempo constante aqui é cinto de segurança: mantém o
  // caminho de conferência uniforme se um dia a busca deixar de ser exata.
  const esperado = Buffer.from(registro.hash, "utf8");
  const recebido = Buffer.from(hashDaChave(chave), "utf8");
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;

  // Sem await: registrar o uso não pode atrasar nem derrubar a requisição.
  prisma.apiKey
    .update({ where: { id: registro.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { tenantId: registro.tenantId, apiKeyId: registro.id };
}
