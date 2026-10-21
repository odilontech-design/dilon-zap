/**
 * Uso de memória do worker no log, a cada 30 minutos.
 *
 * Em 21/10/2026 o worker caiu com "JavaScript heap out of memory" depois de
 * ~5 dias no ar, e não havia como saber se a memória subia devagar o tempo
 * todo ou de uma vez. Uma linha por meia hora custa nada e responde isso:
 * comparando o heapUsedMB ao longo dos dias dá pra ver o ritmo e a hora em
 * que dispara.
 */
const INTERVALO_MS = 30 * 60_000;
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

function registrar() {
  const m = process.memoryUsage();
  console.log(
    `[dilon-zap worker] memoria rssMB=${mb(m.rss)} heapUsedMB=${mb(m.heapUsed)} heapTotalMB=${mb(m.heapTotal)} externalMB=${mb(m.external)} arrayBuffersMB=${mb(m.arrayBuffers)} uptimeH=${(process.uptime() / 3600).toFixed(1)}`
  );
}

export function vigiarMemoria() {
  registrar();
  setInterval(registrar, INTERVALO_MS).unref();
}
