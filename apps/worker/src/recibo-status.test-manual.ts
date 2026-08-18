// Trava de regressão do status de entrega. Os casos descrevem situações que
// o WhatsApp realmente produz — recibo repetido, recibo fora de ordem,
// recibo chegando depois de a gente ter desistido — e dizem o que a
// atendente PRECISA ver na tela depois de cada uma.
//
// Rodar: npx tsx apps/worker/src/recibo-status.test-manual.ts

const NIVEL_STATUS = { PENDING: 0, FAILED: 1, SENT: 2, DELIVERED: 3, READ: 4 } as const;
type Status = keyof typeof NIVEL_STATUS;

// Mesma decisão do aplicarRecibo em session-manager.ts: o updateMany só
// encontra linha quando o status atual está entre os niveis inferiores.
function aplicar(atual: Status, recebido: Status): Status {
  const inferiores = (Object.keys(NIVEL_STATUS) as Status[]).filter(
    (s) => NIVEL_STATUS[s] < NIVEL_STATUS[recebido]
  );
  return inferiores.includes(atual) ? recebido : atual;
}

let falhas = 0;
function caso(descricao: string, atual: Status, recebido: Status, esperado: Status) {
  const obtido = aplicar(atual, recebido);
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"}  ${descricao}` +
      (ok ? "" : `\n         esperado ${esperado}, obtido ${obtido}`)
  );
}

// O BUG: o WhatsApp repete recibos antigos em reconexao e sincronizacao.
// Um SERVER_ACK atrasado chegando depois do READ rebaixava a mensagem, e ela
// ficava assim pra sempre — o recibo de leitura nao vem duas vezes.
caso("recibo de envio atrasado nao rebaixa mensagem lida", "READ", "SENT", "READ");
caso("recibo de envio atrasado nao rebaixa mensagem entregue", "DELIVERED", "SENT", "DELIVERED");
caso("recibo de entrega atrasado nao rebaixa mensagem lida", "READ", "DELIVERED", "READ");

// PROGRESSO NORMAL: o caminho feliz tem que continuar funcionando.
caso("pendente avanca pra enviada", "PENDING", "SENT", "SENT");
caso("enviada avanca pra entregue", "SENT", "DELIVERED", "DELIVERED");
caso("entregue avanca pra lida", "DELIVERED", "READ", "READ");
caso("pendente pode saltar direto pra entregue", "PENDING", "DELIVERED", "DELIVERED");

// REPETICAO: recibo igual chegando duas vezes nao pode causar efeito.
caso("recibo repetido de entrega nao muda nada", "DELIVERED", "DELIVERED", "DELIVERED");
caso("recibo repetido de leitura nao muda nada", "READ", "READ", "READ");

// FALHA: recibo do WhatsApp e prova mais forte que erro nosso.
caso("pendente vira falha quando o envio da erro", "PENDING", "FAILED", "FAILED");
caso("mensagem marcada como falha e corrigida por recibo de entrega", "FAILED", "DELIVERED", "DELIVERED");
caso("mensagem marcada como falha e corrigida por recibo de envio", "FAILED", "SENT", "SENT");
caso("erro tardio nao desfaz uma leitura confirmada", "READ", "FAILED", "READ");
caso("erro tardio nao desfaz uma entrega confirmada", "DELIVERED", "FAILED", "DELIVERED");

console.log(falhas === 0 ? "\nPASSOU" : `\n${falhas} FALHA(S)`);
