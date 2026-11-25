/**
 * O primeiro nome do cliente, para a IA tratá-lo pelo nome. O nome do contato vem do WhatsApp: pode trazer emoji
 * ("🌷 Edlaine Santana 🌷"), vir em maiúsculas, ser só o número do telefone ou um título ("Dr. João").
 * Devolve null quando não dá para usar com segurança: melhor não tratar pelo nome do que errar.
 */

const TITULOS = new Set(["dr", "dra", "sr", "sra", "srta", "prof", "profa", "seu", "dona"]);

export function primeiroNomeDoCliente(nome: string | null | undefined): string | null {
  if (!nome) return null;
  // Só letras (com acento), espaço, hífen e apóstrofo: emoji, número e pontuação saem.
  const limpo = nome.replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  const palavra = limpo.split(" ").find((p) => !TITULOS.has(p.toLowerCase().replace(/\./g, "")) && p.replace(/['-]/g, "").length >= 2);
  if (!palavra) return null;
  // Contato salvo só com a inicial ou com um apelido de uma letra não serve.
  return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
}
