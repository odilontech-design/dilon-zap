// Contas de gestão SaaS: MRR, teste, ativação e alertas. Puro, sem banco.
// Rodar com: npx tsx apps/web/lib/saas.test-manual.ts
import { mrr, diasRestantesDeTeste, ativacao, alertas, type ClienteSaas } from "./saas";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const AGORA = new Date(2026, 8, 10, 15, 0);
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);

function cliente(over: Partial<ClienteSaas>): ClienteSaas {
  return {
    id: "c",
    nome: "Cliente",
    criadoEm: diasAtras(30),
    situacao: "ACTIVE",
    mensalCents: 29700,
    testeAte: null,
    whatsappConectado: true,
    ultimaMensagemEm: diasAtras(0),
    usuariosAtivos: 2,
    faturasVencidas: 0,
    ...over,
  };
}

// --- MRR ---
checa(
  "MRR soma só quem está ativo — o retrato de hoje: só a Believe, R$ 249",
  mrr([
    cliente({ situacao: "ACTIVE", mensalCents: 24900 }),
    cliente({ situacao: "PAUSED", mensalCents: 29700 }),
    cliente({ situacao: "SEM_ASSINATURA", mensalCents: null }),
  ]),
  24900
);
checa(
  "teste NÃO entra no MRR (é receita prometida, não recebida)",
  mrr([cliente({ situacao: "TRIAL", mensalCents: 49700 })]),
  0
);
checa("cancelado não entra", mrr([cliente({ situacao: "CANCELED" })]), 0);

// --- Teste ---
checa("teste acaba em 3 dias", diasRestantesDeTeste(new Date(2026, 8, 13), AGORA), 3);
checa("teste acaba hoje", diasRestantesDeTeste(new Date(2026, 8, 10, 23, 0), AGORA), 0);
checa("teste acabou ontem", diasRestantesDeTeste(new Date(2026, 8, 9), AGORA), -1);

// --- Ativação ---
checa("mensagem hoje: ativo", ativacao(cliente({ ultimaMensagemEm: diasAtras(0) }), AGORA), "ativo");
checa("mensagem há 6 dias: esfriando", ativacao(cliente({ ultimaMensagemEm: diasAtras(6) }), AGORA), "esfriando");
checa("mensagem há 20 dias: parado", ativacao(cliente({ ultimaMensagemEm: diasAtras(20) }), AGORA), "parado");
checa(
  "nunca conectou e nunca teve mensagem: o caso da Guttierres e da Hemoderi",
  ativacao(cliente({ whatsappConectado: false, ultimaMensagemEm: null }), AGORA),
  "nunca_ativou"
);

// --- Alertas ---
const hoje = alertas(
  [
    cliente({ id: "b", nome: "Believe", situacao: "ACTIVE", ultimaMensagemEm: diasAtras(0) }),
    cliente({ id: "g", nome: "Guttierres", situacao: "PAUSED", whatsappConectado: false, ultimaMensagemEm: null }),
    cliente({ id: "h", nome: "Hemoderi", situacao: "SEM_ASSINATURA", whatsappConectado: false, ultimaMensagemEm: null }),
  ],
  AGORA
);
checa("Believe, que usa todo dia, não gera alerta", hoje.some((a) => a.clienteId === "b"), false);
checa(
  "Guttierres aparece por nunca ter conectado",
  hoje.some((a) => a.clienteId === "g" && a.texto.includes("nunca conectou")),
  true
);
checa(
  "Hemoderi aparece duas vezes: sem assinatura E nunca conectou",
  hoje.filter((a) => a.clienteId === "h").length,
  2
);
checa("urgentes vêm antes dos de atenção", hoje[0].nivel, "urgente");

checa(
  "cancelado não gera alerta nenhum (não há o que fazer hoje)",
  alertas([cliente({ situacao: "CANCELED", whatsappConectado: false, ultimaMensagemEm: null })], AGORA).length,
  0
);

checa(
  "teste vencido é urgente",
  alertas([cliente({ situacao: "TRIAL", testeAte: diasAtras(2) })], AGORA)[0]?.nivel,
  "urgente"
);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
