/**
 * Contato comercial mostrado na tela de login.
 *
 * O número fica em variável de ambiente com um padrão no código, e não apenas
 * escrito na tela: este sistema é vendido como produto, e uma instalação
 * white-label para outra empresa não pode sair exibindo o WhatsApp da Dilon
 * Tech para os clientes dela. Quem instalar sobrescreve;
 * `NEXT_PUBLIC_WHATSAPP_SUPORTE=""` esconde o formulário por completo.
 *
 * É NEXT_PUBLIC porque o link é montado no navegador, com o que a pessoa
 * digitou — não há segredo aqui, o número é justamente o que se quer publicar.
 *
 * Mesmo raciocínio (e mesmo número) de apps/esquadrias/lib/suporte.ts. São
 * dois produtos com telas de login separadas; quando um terceiro precisar
 * disso, vale extrair pra um pacote em vez de uma terceira cópia.
 */

const PADRAO = "5521967411481";

/** Só dígitos, com código do país. O wa.me recusa espaço, hífen e parêntese. */
function normalizar(bruto: string): string {
  return bruto.replace(/\D/g, "");
}

/** Número de destino, ou null quando a instalação não quer expor contato. */
export function numeroDoComercial(): string | null {
  const bruto = process.env.NEXT_PUBLIC_WHATSAPP_SUPORTE ?? PADRAO;
  const numero = normalizar(bruto);
  // Vazio esconde o formulário. Número curto demais é engano de digitação, e
  // um link quebrado no lugar do contato é pior que contato nenhum.
  return numero.length >= 10 ? numero : null;
}

/** Monta o link do WhatsApp já com a mensagem pronta pra pessoa só enviar. */
export function linkComMensagem(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
