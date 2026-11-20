import { ErroImagem, conferirEndereco } from "./baixar-imagem";

/**
 * Busca uma página HTML de um endereço que veio de fora (o site atual da loja,
 * digitado na tela de importação). Mesmas proteções do download de fotos: só
 * http(s), só hosts públicos (nada de rede interna ou metadados da nuvem),
 * cada redirecionamento conferido de novo, tamanho e tipo limitados.
 */

export class ErroPagina extends Error {}

const MAXIMO_BYTES = 3 * 1024 * 1024;
const MAXIMO_REDIRECIONAMENTOS = 4;

export async function buscarPagina(endereco: string, opcoes: { timeoutMs?: number; permitirRedeInterna?: boolean } = {}): Promise<{ html: string; urlFinal: string }> {
  let url: URL;
  try {
    url = new URL(endereco);
  } catch {
    throw new ErroPagina("endereço inválido");
  }

  let resposta: Response | null = null;
  for (let salto = 0; salto <= MAXIMO_REDIRECIONAMENTOS; salto++) {
    try {
      await conferirEndereco(url, !!opcoes.permitirRedeInterna);
    } catch (e) {
      throw new ErroPagina(e instanceof ErroImagem ? e.message : "endereço não aceito");
    }
    try {
      resposta = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(opcoes.timeoutMs ?? 20_000),
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; DilonZap/1.0; importacao de estoque)" },
      });
    } catch {
      throw new ErroPagina("o site não respondeu");
    }
    if (resposta.status >= 300 && resposta.status < 400) {
      const proximo = resposta.headers.get("location");
      if (!proximo) throw new ErroPagina("redirecionamento sem destino");
      url = new URL(proximo, url);
      continue;
    }
    break;
  }
  if (!resposta || (resposta.status >= 300 && resposta.status < 400)) throw new ErroPagina("redirecionamentos demais");
  if (!resposta.ok) throw new ErroPagina(`o site respondeu ${resposta.status}`);
  const tipo = (resposta.headers.get("content-type") ?? "").toLowerCase();
  if (tipo && !tipo.includes("html")) throw new ErroPagina("o endereço não é uma página de site");

  const declarado = Number(resposta.headers.get("content-length") ?? 0);
  if (declarado > MAXIMO_BYTES) throw new ErroPagina("a página é grande demais");
  const bytes = Buffer.from(await resposta.arrayBuffer());
  if (bytes.length > MAXIMO_BYTES) throw new ErroPagina("a página é grande demais");
  return { html: bytes.toString("utf8"), urlFinal: url.toString() };
}
