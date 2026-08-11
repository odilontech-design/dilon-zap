import pino, { type Logger } from "pino";

/**
 * Logger que damos pro Baileys: deixa ele chamar `debug` normalmente, mas só
 * grava as linhas que dizem algo sobre saúde de criptografia.
 *
 * Por que não simplesmente subir LOG_LEVEL: o evento que precisamos medir é
 * `recv retry request` — o WhatsApp avisando que o aparelho do CLIENTE não
 * conseguiu decifrar uma mensagem nossa e está pedindo reenvio. É o único
 * sinal que temos desse problema, porque a mensagem chega a constar como
 * entregue e até lida mesmo sem o cliente conseguir abrir. Só que ele é
 * logado em `debug`, e o Baileys em debug despeja o tráfego inteiro do socket
 * — numa VPS de 1 vCPU, sem rotação de log, isso enche o disco.
 *
 * `warn` e `error` passam sempre: filtrar erro pra economizar log é como
 * desligar o alarme de incêndio pra não gastar bateria.
 */
const INTERESSA = /retry|decrypt|bad mac|no matching sessions|prekey/i;

function textoDe(obj: unknown, msg?: string): string {
  if (typeof obj === "string") return obj;
  return msg ?? "";
}

function filtrar(base: Logger): Logger {
  const passaSeInteressar =
    (nivel: "trace" | "debug" | "info") =>
    (obj: unknown, msg?: string, ...resto: unknown[]) => {
      if (!INTERESSA.test(textoDe(obj, msg))) return;
      (base[nivel] as (...a: unknown[]) => void)(obj, msg, ...resto);
    };

  const sempre =
    (nivel: "warn" | "error" | "fatal") =>
    (...args: unknown[]) =>
      (base[nivel] as (...a: unknown[]) => void)(...args);

  return {
    // O Baileys checa `level` pra decidir se vale montar o objeto de log.
    // Dizemos "debug" porque queremos que ele CHAME debug — quem descarta
    // somos nós, logo acima, e não ele.
    level: "debug",
    child: () => filtrar(base),
    trace: passaSeInteressar("trace"),
    debug: passaSeInteressar("debug"),
    info: passaSeInteressar("info"),
    warn: sempre("warn"),
    error: sempre("error"),
    fatal: sempre("fatal"),
    silent: () => {},
  } as unknown as Logger;
}

export function criarBaileysLogger(): Logger {
  return filtrar(pino({ level: "debug" }));
}
