/**
 * Service worker do Dilon Zap.
 *
 * Só existe pra notificação. NÃO faz cache de nada de propósito: cache de
 * app shell é a forma clássica de um sistema continuar servindo a versão
 * velha depois de um deploy, e aqui deploy acontece toda semana — o ganho de
 * abrir offline não paga o risco de alguém atender com a tela de ontem.
 *
 * Push só chega em navegador que permitiu, e no iPhone só depois que o site
 * foi adicionado à tela de início (regra do Safari, ver app/manifest.ts).
 */

// Assume o controle já na primeira carga, sem esperar a aba ser fechada e
// reaberta — senão a pessoa permite a notificação e ela só passa a funcionar
// no dia seguinte.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    // Push sem corpo ou com corpo inválido: ainda vale avisar que tem algo
    // novo, melhor que engolir o evento em silêncio.
  }

  const titulo = dados.titulo || "Dilon Zap";
  const opcoes = {
    body: dados.corpo || "Você tem uma novidade no atendimento.",
    icon: "/icone-192.png",
    badge: "/icone-192.png",
    // Agrupa por conversa: três mensagens da mesma conversa viram um aviso
    // atualizado, não três empilhados na tela de bloqueio.
    tag: dados.tag || "dilon-zap",
    renotify: true,
    data: { url: dados.url || "/inbox" },
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = event.notification.data?.url || "/inbox";

  // Se o sistema já está aberto numa aba, leva ELA pro destino em vez de
  // abrir outra — senão quem usa no computador acaba com meia dúzia de abas
  // do Dilon Zap ao longo do dia.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abas) => {
      for (const aba of abas) {
        if (aba.url.includes("/inbox") && "focus" in aba) {
          aba.navigate(destino);
          return aba.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
