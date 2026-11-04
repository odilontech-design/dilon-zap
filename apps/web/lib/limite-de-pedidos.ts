/**
 * Teto de pedidos por chave (endereço, e-mail) numa janela de tempo, em memória: zera a cada deploy e
 * não guarda IP em banco nenhum (mesmo critério de /api/cadastro). É uma barreira contra robô, não uma
 * cota; o que realmente protege a criação de escritórios é o link enviado por e-mail.
 */
export function criarLimitador(teto: number, janelaMs: number) {
  const tentativas = new Map<string, number[]>();
  return (chave: string, agora = Date.now()): boolean => {
    const recentes = (tentativas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
    recentes.push(agora);
    tentativas.set(chave, recentes);
    if (tentativas.size > 5000) for (const [k, v] of tentativas) if (v.every((t) => agora - t >= janelaMs)) tentativas.delete(k);
    return recentes.length > teto;
  };
}

export const enderecoDoPedido = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "desconhecido";
