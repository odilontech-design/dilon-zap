import { XMLParser } from "fast-xml-parser";

/**
 * Chamada SOAP 1.1 ao ASMX da Webmotors. O contrato (WSDL) é público:
 * https://integracao.webmotors.com.br/<serviço>.asmx?WSDL. O corpo vai em XML, com os
 * campos na ordem exata do esquema (o ASMX recusa fora de ordem), e a resposta volta em XML.
 */

export class ErroSoap extends Error {
  constructor(message: string, readonly http?: number) {
    super(message);
  }
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false, // códigos decimais e placas ficam como texto, sem perder zero à esquerda
  trimValues: true,
});

const escapa = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Um valor de campo SOAP: texto escapado, decimal com ponto. null/undefined = campo omitido. */
export function valorXml(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  return escapa(String(v));
}

/** `<nome>valor</nome>` na ordem dada; campos sem valor ficam de fora. Aceita filhos já montados. */
export function campos(lista: [string, string | number | null | undefined][]): string {
  return lista
    .map(([n, v]) => {
      const x = valorXml(v);
      return x === null ? "" : `<${n}>${x}</${n}>`;
    })
    .join("");
}

export type OpcoesSoap = {
  url: string;
  /** Espaço de nomes do serviço, ex.: "www.webmotors.com.br/wsEstoqueRevendedorWebMotors". */
  ns: string;
  operacao: string;
  /** O interior do elemento da operação, já em XML (use `campos`). */
  corpo: string;
  timeoutMs?: number;
};

/** Faz a chamada e devolve o conteúdo de `<operacaoResult>` (objeto, lista ou texto) ou lança ErroSoap. */
export async function chamarSoap(o: OpcoesSoap): Promise<unknown> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><${o.operacao} xmlns="${o.ns}">${o.corpo}</${o.operacao}></soap:Body></soap:Envelope>`;
  let res: Response;
  try {
    res = await fetch(o.url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${o.ns}/${o.operacao}"` },
      body: envelope,
      signal: AbortSignal.timeout(o.timeoutMs ?? 45_000),
    });
  } catch {
    throw new ErroSoap("a Webmotors não respondeu");
  }
  const texto = await res.text();
  let xml: any;
  try {
    xml = parser.parse(texto);
  } catch {
    throw new ErroSoap(`a Webmotors devolveu algo que não é XML (HTTP ${res.status})`, res.status);
  }
  const corpo = xml?.Envelope?.Body;
  const falha = corpo?.Fault;
  if (falha) throw new ErroSoap(`a Webmotors recusou a chamada: ${String(falha.faultstring ?? falha.Reason?.Text ?? "erro").slice(0, 200)}`, res.status);
  if (!res.ok || !corpo) throw new ErroSoap(`a Webmotors respondeu HTTP ${res.status}`, res.status);
  const resposta = corpo[`${o.operacao}Response`];
  return resposta?.[`${o.operacao}Result`] ?? resposta ?? null;
}

/** Normaliza um nó que pode vir como objeto único, lista ou ausente. */
export function comoLista<T = any>(no: unknown, nomeItem: string): T[] {
  if (!no || typeof no !== "object") return [];
  const item = (no as Record<string, unknown>)[nomeItem];
  if (item === undefined) return [];
  return Array.isArray(item) ? (item as T[]) : [item as T];
}
