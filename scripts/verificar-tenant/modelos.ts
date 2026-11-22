/**
 * Lê o schema do Prisma COMO TEXTO (nunca abre conexão) e diz, por modelo,
 * quais campos existem e quais são relações. É daqui que a verificação sabe
 * que `Contact` tem `tenantId` próprio e `Message` não tem.
 */

export interface Modelo {
  nome: string;
  /** Nome da propriedade no cliente Prisma: `Contact` vira `contact`. */
  propriedade: string;
  temTenantId: boolean;
  /** Campos cujo tipo é outro modelo (relações). */
  relacoes: Set<string>;
}

export function minusculaInicial(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function lerModelos(textoDoSchema: string): Map<string, Modelo> {
  const porPropriedade = new Map<string, Modelo>();
  const nomes = [...textoDoSchema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);
  const conjunto = new Set(nomes);

  for (const bloco of textoDoSchema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, nome, corpo] = bloco;
    let temTenantId = false;
    const relacoes = new Set<string>();
    for (const linha of corpo.split("\n")) {
      const campo = /^\s{1,4}(\w+)\s+(\w+)(\[\]|\?)?/.exec(linha);
      if (!campo || linha.trim().startsWith("//") || linha.trim().startsWith("@@")) continue;
      const [, campoNome, tipo] = campo;
      if (campoNome === "tenantId") temTenantId = true;
      if (conjunto.has(tipo)) relacoes.add(campoNome);
    }
    porPropriedade.set(minusculaInicial(nome), { nome, propriedade: minusculaInicial(nome), temTenantId, relacoes });
  }
  return porPropriedade;
}
