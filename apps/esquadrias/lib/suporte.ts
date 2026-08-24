/**
 * Contato de suporte mostrado na tela de login.
 *
 * O número fica em variável de ambiente com um padrão no código, e não
 * apenas escrito na tela: este sistema é vendido como produto, e uma
 * instalação white-label para outra empresa não pode sair exibindo o WhatsApp
 * da Dilon Tech para os clientes dela. Quem instalar sobrescreve;
 * `NEXT_PUBLIC_WHATSAPP_SUPORTE=""` esconde o botão por completo.
 *
 * É NEXT_PUBLIC porque o link é montado no HTML da página — não há segredo
 * aqui, o número é justamente o que se quer publicar.
 */
const PADRAO = "5521967411481";

/** Só dígitos, com código do país. O wa.me recusa espaço, hífen e parêntese. */
function normalizar(bruto: string): string {
  return bruto.replace(/\D/g, "");
}

export function linkDoSuporte(): string | null {
  const bruto = process.env.NEXT_PUBLIC_WHATSAPP_SUPORTE ?? PADRAO;
  const numero = normalizar(bruto);

  // Vazio esconde o botão. Número curto demais é engano de digitação, e um
  // link quebrado no lugar do suporte é pior que suporte nenhum.
  if (numero.length < 12) return null;

  const mensagem = encodeURIComponent(
    "Olá! Estou testando o sistema de esquadrias e preciso de ajuda.",
  );
  return `https://wa.me/${numero}?text=${mensagem}`;
}

/** O número formatado para leitura, quando faz sentido mostrá-lo escrito. */
export function telefoneDoSuporte(): string | null {
  const numero = normalizar(process.env.NEXT_PUBLIC_WHATSAPP_SUPORTE ?? PADRAO);
  if (numero.length < 12) return null;

  const semPais = numero.startsWith("55") ? numero.slice(2) : numero;
  const ddd = semPais.slice(0, 2);
  const resto = semPais.slice(2);
  const meio = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`;
}
