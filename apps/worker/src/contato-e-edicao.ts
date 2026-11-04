import { createDecipheriv, createHmac } from "node:crypto";
import { jidNormalizedUser, proto } from "@whiskeysockets/baileys";

/* ------------------------------------------------------------------------ *
 * Cartão de contato (vCard)
 * ------------------------------------------------------------------------ */

/** Nome e telefones de um vCard recebido. Puro, para teste. */
export function lerVcard(vcard: string): { nome: string | null; telefones: string[] } {
  const linhas = vcard.split(/\r?\n/);
  const fn = linhas.find((l) => /^FN[:;]/i.test(l));
  const nome = fn ? fn.slice(fn.indexOf(":") + 1).trim() || null : null;
  const telefones = linhas
    .filter((l) => /^(item\d+\.)?TEL[:;]/i.test(l))
    .map((l) => {
      // waid= traz o número limpo que o WhatsApp usa; senão, o que vem depois do ":".
      const waid = /waid=(\d+)/i.exec(l)?.[1];
      return waid ? `+${waid}` : l.slice(l.indexOf(":") + 1).trim();
    })
    .filter(Boolean);
  return { nome, telefones };
}

/** Texto que fica no histórico para um cartão de contato. */
export function textoDoContato(vcard: string, nomeExibido?: string | null): string {
  const { nome, telefones } = lerVcard(vcard);
  return [`📇 ${nomeExibido || nome || "Contato"}`, ...telefones].join("\n");
}

/** vCard mínimo que o WhatsApp entende (waid = número só com dígitos). */
export function montarVcard(nome: string, telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  const nomeLimpo = nome.replace(/[\r\n;]/g, " ").trim() || digitos;
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${nomeLimpo}`,
    `TEL;type=CELL;type=VOICE;waid=${digitos}:+${digitos}`,
    "END:VCARD",
  ].join("\n");
}

/* ------------------------------------------------------------------------ *
 * Edição no formato novo (secretEncryptedMessage)
 * ------------------------------------------------------------------------ */

/**
 * Abre uma edição cifrada com o messageSecret da mensagem original.
 *
 * O WhatsApp passou a mandar edições assim (Hemoderi, 15/10) e o Baileys
 * 7.0.0-rc14 não as abre. A derivação é a mesma do voto de enquete
 * (decryptPollVote do Baileys / msgsecret do whatsmeow): HKDF-SHA256 sem sal
 * sobre o segredo, com info = id da original + autor da original + autor da
 * edição + o "caso de uso", e AES-256-GCM com aad = id + "\0" + autor da edição.
 *
 * Os JIDs podem vir como telefone ou como LID — tenta as combinações. Chave
 * errada falha na autenticação do GCM, então tentar não tem risco de abrir
 * lixo. Devolve a mensagem nova, ou null se nenhuma combinação abriu.
 */
export function abrirEdicaoSecreta(p: {
  segredo: Buffer;
  idOriginal: string;
  autoresOriginal: (string | null | undefined)[];
  autoresEdicao: (string | null | undefined)[];
  encPayload: Uint8Array;
  encIv: Uint8Array;
}): proto.IMessage | null {
  const normalizar = (lista: (string | null | undefined)[]) =>
    [...new Set(lista.filter((j): j is string => !!j).map((j) => jidNormalizedUser(j)).filter(Boolean))];
  const originais = normalizar(p.autoresOriginal);
  const editores = normalizar(p.autoresEdicao);
  if (p.encPayload.length <= 16) return null;

  const extraido = createHmac("sha256", Buffer.alloc(32)).update(p.segredo).digest();
  const cifrado = Buffer.from(p.encPayload.subarray(0, p.encPayload.length - 16));
  const tag = Buffer.from(p.encPayload.subarray(p.encPayload.length - 16));

  for (const casoDeUso of ["Message Edit"]) {
    for (const original of originais) {
      for (const editor of editores) {
        const info = Buffer.concat([
          Buffer.from(p.idOriginal),
          Buffer.from(original),
          Buffer.from(editor),
          Buffer.from(casoDeUso),
          Buffer.from([1]),
        ]);
        const chave = createHmac("sha256", extraido).update(info).digest();
        try {
          const decifra = createDecipheriv("aes-256-gcm", chave, Buffer.from(p.encIv));
          decifra.setAAD(Buffer.from(`${p.idOriginal}\u0000${editor}`));
          decifra.setAuthTag(tag);
          const claro = Buffer.concat([decifra.update(cifrado), decifra.final()]);
          return proto.Message.decode(claro);
        } catch {
          // combinação errada: tenta a próxima
        }
      }
    }
  }
  return null;
}
