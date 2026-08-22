/**
 * Fetcher do SWR. Erro da API vira Error com a MENSAGEM da API — o painel
 * consegue mostrar "o plano atual permite 3 usuários" em vez de um "erro ao
 * carregar" genérico que não diz o que fazer.
 */
export async function buscar<T>(url: string): Promise<T> {
  const resposta = await fetch(url);
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error((corpo as { error?: string }).error ?? "não foi possível carregar");
  }
  return resposta.json();
}

/** POST/PATCH/PUT/DELETE com o mesmo tratamento de erro. */
export async function enviar<T>(url: string, metodo: "POST" | "PATCH" | "PUT" | "DELETE", dados?: unknown): Promise<T> {
  const resposta = await fetch(url, {
    method: metodo,
    headers: dados ? { "Content-Type": "application/json" } : undefined,
    body: dados ? JSON.stringify(dados) : undefined,
  });

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error((corpo as { error?: string }).error ?? "não foi possível salvar");
  return corpo as T;
}
