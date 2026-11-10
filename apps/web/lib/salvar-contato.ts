/**
 * Grava campos de um contato (PATCH /api/contacts/:id) e diz se deu certo.
 *
 * Existe porque a ficha chamava o fetch e seguia em frente sem olhar a
 * resposta. Com a sessão expirada a rota redireciona para o login e responde
 * 200 com HTML; com a rede ou o servidor falhando vem erro. Nos dois casos a
 * atendente via o que tinha digitado, achava que estava salvo, e na próxima
 * vez a ficha estava vazia (relato da Believe, 10/11: "sumiram os dados").
 *
 * Devolve sempre um resultado, nunca lança: quem chama decide onde mostrar.
 */

export type ResultadoSalvar = { ok: true } | { ok: false; erro: string };

type Buscar = (url: string, init: RequestInit) => Promise<Response>;

const SESSAO_EXPIROU = "Sua sessão expirou. Entre de novo para salvar.";

export async function salvarContato(
  contactId: string,
  campos: Record<string, unknown>,
  buscar: Buscar = (url, init) => fetch(url, init)
): Promise<ResultadoSalvar> {
  let res: Response;
  try {
    res = await buscar(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campos),
    });
  } catch {
    return { ok: false, erro: "Sem conexão com o servidor. Confira a internet e tente de novo." };
  }

  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) return { ok: false, erro: SESSAO_EXPIROU };

  if (!res.ok) {
    const corpo = (await res.json().catch(() => ({}))) as { error?: unknown };
    if (res.status === 401) return { ok: false, erro: SESSAO_EXPIROU };
    return { ok: false, erro: typeof corpo.error === "string" ? corpo.error : "Não foi possível salvar." };
  }
  return { ok: true };
}
