// Regras do Vendedor IA. Puro. Rodar com: npx tsx packages/vendedor-ia/src/regras.test-manual.ts
import { ESPERA_MS, MAX_TURNOS, decidir, montarHistorico, paraWhatsApp, type EstadoDaConversa, type MensagemDaConversa } from "./regras";
import { FERRAMENTAS, montarSistema } from "./prompt";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const t = (s: number) => new Date(Date.UTC(2026, 10, 12, 15, 0, s));
const cli = (s: number, body: string, extra: Partial<MensagemDaConversa> = {}): MensagemDaConversa => ({
  direction: "INBOUND", body, mediaType: null, createdAt: t(s), senderUserId: null, deCelular: false, isDeleted: false, ...extra,
});
const loja = (s: number, body: string, extra: Partial<MensagemDaConversa> = {}): MensagemDaConversa => ({
  direction: "OUTBOUND", body, mediaType: null, createdAt: t(s), senderUserId: null, deCelular: false, isDeleted: false, ...extra,
});

checa(
  "histórico junta mensagens seguidas e começa pelo cliente",
  montarHistorico([loja(0, "Olá! Seja bem-vindo"), cli(1, "oi"), cli(2, "ainda tem o polo?"), loja(3, "Tem sim", { mediaType: "IMAGE" }), cli(4, "", { mediaType: "AUDIO" })]),
  [
    { role: "user", content: "oi\nainda tem o polo?" },
    { role: "assistant", content: "[foto] Tem sim" },
    { role: "user", content: "[áudio]" },
  ]
);
checa("última palavra da loja: nada a responder", montarHistorico([cli(1, "oi"), loja(2, "olá")]), null);
checa("apagada fica de fora", montarHistorico([cli(1, "oi"), cli(2, "xingamento", { isDeleted: true })]), [{ role: "user", content: "oi" }]);

const ativadoEm = t(0);
const base = (m: MensagemDaConversa[], extra: Partial<EstadoDaConversa> = {}): EstadoDaConversa => ({ conversa: null, mensagens: m, ativadoEm, atribuida: false, limiteAtingido: false, ...extra });
const agora = (s: number) => t(s);

checa("espera o cliente terminar de digitar", decidir(base([cli(10, "oi")]), agora(10 + ESPERA_MS / 1000 - 1)), { acao: "esperar" });
checa("responde depois do silêncio", decidir(base([cli(10, "oi")]), agora(20)), { acao: "responder" });
checa("não assume conversa atribuída", decidir(base([cli(10, "oi")], { atribuida: true }), agora(20)), { acao: "ignorar", motivo: "conversa já é de alguém" });
checa("não assume se a equipe já atendia", decidir(base([loja(5, "oi", { senderUserId: "u1" }), cli(10, "e aí")]), agora(20)), { acao: "ignorar", motivo: "equipe já atendia" });
checa("limite do mês barra conversa nova", decidir(base([cli(10, "oi")], { limiteAtingido: true }), agora(20)), { acao: "ignorar", motivo: "limite do mês" });
const ativa = { status: "ATIVA" as const, respondidoAte: t(10), turnos: 1, iniciadaEm: t(10) };
checa("limite do mês não corta conversa em andamento", decidir(base([cli(10, "oi"), loja(15, "olá"), cli(30, "e o preço?")], { conversa: ativa, limiteAtingido: true }), agora(40)), { acao: "responder" });
checa("já respondida", decidir(base([cli(10, "oi")], { conversa: ativa }), agora(40)), { acao: "ignorar", motivo: "já respondida" });
checa(
  "equipe respondeu: IA sai",
  decidir(base([cli(10, "oi"), loja(15, "olá"), loja(25, "Oi, aqui é o Carlos", { deCelular: true }), cli(30, "oi carlos")], { conversa: ativa }), agora(40)),
  { acao: "transferir", motivo: "equipe respondeu" }
);
checa("robô ou IA falando não conta como equipe", decidir(base([cli(10, "oi"), loja(15, "olá"), cli(30, "e o preço?")], { conversa: ativa }), agora(40)), { acao: "responder" });
checa("transferida não responde", decidir(base([cli(30, "oi")], { conversa: { ...ativa, status: "TRANSFERIDA" } }), agora(40)), { acao: "ignorar", motivo: "já transferida" });
checa("mensagem velha", decidir(base([cli(10, "oi")]), new Date(t(10).getTime() + 16 * 60_000)), { acao: "ignorar", motivo: "mensagem velha" });
checa("mensagem de antes de ligar", decidir(base([cli(10, "oi")], { ativadoEm: t(20) }), agora(40)), { acao: "ignorar", motivo: "mensagem de antes de ligar a IA" });
checa("limite de turnos", decidir(base([cli(10, "oi"), loja(15, "x"), cli(30, "y")], { conversa: { ...ativa, turnos: MAX_TURNOS } }), agora(40)), { acao: "transferir", motivo: "limite de respostas da IA na conversa" });

checa("negrito do WhatsApp", paraWhatsApp("## Polo\n**R$ 92.900**\n\n\n\nok"), "Polo\n*R$ 92.900*\n\nok");

const sistema = montarSistema({ nomeLoja: "Sales Automóveis", nomeAssistente: "Lia", instrucoes: "Av. Brasil, 100. Seg a sex 8h–18h." });
checa("instruções da loja no fim do prompt", sistema.trim().endsWith("Seg a sex 8h–18h."), true);
checa("sem instruções da loja, sem bloco vazio", montarSistema({ nomeLoja: "X", nomeAssistente: "Y", instrucoes: "  " }).includes("Informações e orientações"), false);
checa(
  "ferramentas estritas com todo campo obrigatório",
  FERRAMENTAS.every((f) => f.strict && Object.keys((f.input_schema as { properties: object }).properties).length === (f.input_schema.required ?? []).length),
  true
);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
