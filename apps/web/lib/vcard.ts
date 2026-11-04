/**
 * Cartão de contato do WhatsApp (vCard). Mesma regra do worker
 * (apps/worker/src/contato-e-edicao.ts) — dois apps, um formato.
 */

/** Só dígitos, com o 55 quando vem só com DDD. */
export function telefoneComPais(telefone: string): string {
  const d = telefone.replace(/\D/g, "");
  return d.length <= 11 ? `55${d}` : d;
}

export function montarVcard(nome: string, telefone: string): string {
  const digitos = telefoneComPais(telefone);
  const nomeLimpo = nome.replace(/[\r\n;]/g, " ").trim() || digitos;
  return ["BEGIN:VCARD", "VERSION:3.0", `FN:${nomeLimpo}`, `TEL;type=CELL;type=VOICE;waid=${digitos}:+${digitos}`, "END:VCARD"].join("\n");
}

/** Um ou mais cartões (vários vCards colados) → nome e telefones de cada. */
export function lerVcards(texto: string): { nome: string; telefones: string[] }[] {
  return texto
    .split(/END:VCARD/i)
    .map((bloco) => bloco.trim())
    .filter((bloco) => /BEGIN:VCARD/i.test(bloco))
    .map((bloco) => {
      const linhas = bloco.split(/\r?\n/);
      const fn = linhas.find((l) => /^FN[:;]/i.test(l));
      const telefones = linhas
        .filter((l) => /^(item\d+\.)?TEL[:;]/i.test(l))
        .map((l) => {
          const waid = /waid=(\d+)/i.exec(l)?.[1];
          return waid ?? l.slice(l.indexOf(":") + 1).replace(/\D/g, "");
        })
        .filter(Boolean);
      return { nome: fn ? fn.slice(fn.indexOf(":") + 1).trim() : "Contato", telefones };
    });
}
