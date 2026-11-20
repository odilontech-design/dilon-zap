import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Baixa uma imagem de um endereço que veio de fora (a planilha de importação).
 *
 * O endereço é escrito por quem sobe a planilha, então o servidor não pode
 * sair buscando qualquer coisa (SSRF): só http(s), só hosts públicos (nada de
 * localhost, rede interna, metadados da nuvem em 169.254.x), cada
 * redirecionamento é conferido de novo, e o tamanho e o tipo são limitados.
 */

export class ErroImagem extends Error {}

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAXIMO_BYTES = 10 * 1024 * 1024;
const MAXIMO_REDIRECIONAMENTOS = 3;

/** Endereço IP que não pode ser alvo: loopback, privado, link-local, CGNAT, multicast, reservado. */
export function ipInterno(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return ipInterno(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("ff");
}

export async function conferirEndereco(url: URL, permitirRedeInterna: boolean) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ErroImagem("endereço precisa começar com http ou https");
  if (url.username || url.password) throw new ErroImagem("endereço com usuário e senha não é aceito");
  if (permitirRedeInterna) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length) throw new ErroImagem("endereço não encontrado");
  if (ips.some(ipInterno)) throw new ErroImagem("endereço de rede interna não é aceito");
}

export async function baixarImagem(
  endereco: string,
  opcoes: { permitirRedeInterna?: boolean; timeoutMs?: number } = {}
): Promise<{ bytes: Buffer; contentType: string; extensao: string }> {
  let url: URL;
  try {
    url = new URL(endereco);
  } catch {
    throw new ErroImagem("endereço inválido");
  }

  let resposta: Response | null = null;
  for (let salto = 0; salto <= MAXIMO_REDIRECIONAMENTOS; salto++) {
    await conferirEndereco(url, !!opcoes.permitirRedeInterna);
    try {
      resposta = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(opcoes.timeoutMs ?? 15_000), headers: { accept: "image/*" } });
    } catch {
      throw new ErroImagem("o endereço não respondeu");
    }
    if (resposta.status >= 300 && resposta.status < 400) {
      const proximo = resposta.headers.get("location");
      if (!proximo) throw new ErroImagem("redirecionamento sem destino");
      url = new URL(proximo, url);
      continue;
    }
    break;
  }
  if (!resposta || (resposta.status >= 300 && resposta.status < 400)) throw new ErroImagem("redirecionamentos demais");
  if (!resposta.ok) throw new ErroImagem(`o endereço respondeu ${resposta.status}`);

  const contentType = (resposta.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const extensao = TIPOS[contentType];
  if (!extensao) throw new ErroImagem(`não é uma imagem JPG, PNG ou WEBP (${contentType || "tipo desconhecido"})`);
  if (Number(resposta.headers.get("content-length") ?? 0) > MAXIMO_BYTES) throw new ErroImagem("imagem maior que 10MB");

  // Lê em pedaços e corta no limite: o content-length pode mentir ou faltar.
  const leitor = resposta.body?.getReader();
  if (!leitor) throw new ErroImagem("resposta vazia");
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAXIMO_BYTES) {
      await leitor.cancel().catch(() => {});
      throw new ErroImagem("imagem maior que 10MB");
    }
    pedacos.push(value);
  }
  if (!total) throw new ErroImagem("imagem vazia");
  return { bytes: Buffer.concat(pedacos), contentType: contentType === "image/jpg" ? "image/jpeg" : contentType, extensao };
}
