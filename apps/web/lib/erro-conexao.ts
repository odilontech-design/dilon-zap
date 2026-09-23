/**
 * Traduz o erro cru que o WhatsApp devolve quando a conexão cai.
 *
 * O texto original vem da biblioteca, em inglês e com jargão de protocolo
 * ("Stream Errored (conflict)"). Mostrar isso pro cliente não diz o que
 * aconteceu nem o que fazer — e no caso do `device_removed`, que é alguém ter
 * removido o aparelho no celular, o cliente procura defeito no sistema quando
 * o caminho é só ler o QR Code de novo.
 *
 * Fica separado da tela porque o mesmo recado aparece na conexão e no Inbox,
 * e porque assim dá pra testar sem navegador.
 */
export function explicarErroDeConexao(erro: string | null | undefined): string | null {
  if (!erro) return null;
  const texto = erro.toLowerCase();

  // O motivo específico vem no log do worker; na tela chega só o "conflict".
  // Os dois caem no mesmo recado porque a saída é a mesma: reconectar.
  if (texto.includes("device_removed") || texto.includes("conflict")) {
    return "O WhatsApp do celular desconectou este aparelho. Costuma ser alguém removendo em Aparelhos conectados, ou o WhatsApp reinstalado ou trocado de celular. Leia o QR Code de novo pra voltar a atender.";
  }

  if (texto.includes("logged out") || texto.includes("loggedout") || texto.includes("401")) {
    return "A conexão com o WhatsApp foi encerrada. Leia o QR Code de novo pra voltar a atender.";
  }

  if (texto.includes("restart required")) {
    return "O WhatsApp pediu pra reiniciar a conexão. Isso costuma se resolver sozinho em alguns segundos.";
  }

  if (texto.includes("timed out") || texto.includes("timeout")) {
    return "A conexão com o WhatsApp demorou demais pra responder. Se não voltar sozinha em alguns minutos, leia o QR Code de novo.";
  }

  if (texto.includes("connection closed") || texto.includes("connection lost") || texto.includes("econnreset")) {
    return "A conexão com o WhatsApp caiu. O sistema tenta voltar sozinho; se continuar assim, leia o QR Code de novo.";
  }

  // Erro que ainda não conhecemos: melhor mostrar o original do que engolir.
  // Assim o suporte tem o que investigar, em vez de um "erro inesperado".
  return erro;
}
