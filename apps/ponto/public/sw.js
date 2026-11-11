// Service worker mínimo: existe para o navegador oferecer "Adicionar à tela
// inicial". Não guarda páginas em cache de propósito: ponto é dado ao vivo, e
// uma tela velha em cache mostraria marcações que já mudaram. A marcação feita
// sem internet é guardada pela própria página (localStorage) e reenviada.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
