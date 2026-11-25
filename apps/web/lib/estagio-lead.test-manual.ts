// Estágio automático do lead: deduzido da conversa, sem ninguém clicar.
// Rodar de apps/web com: npx tsx lib/estagio-lead.test-manual.ts
import assert from "node:assert/strict";
import { autorDaMensagem, estagioDoLead, tipoDoMotivoDaIa, type MensagemDoLead, type SinaisDoLead } from "./estagio-lead";

const agora = new Date("2026-11-25T15:00:00Z");
const min = (m: number) => new Date(agora.getTime() - m * 60_000);
const dia = (d: number) => new Date(agora.getTime() - d * 86_400_000);
const msg = (de: MensagemDoLead["de"], em: Date): MensagemDoLead => ({ de, em });

function sinais(p: Partial<SinaisDoLead> & { recebidoEm: Date }): SinaisDoLead {
  return { respondidoManualEm: null, mensagens: [], statusNegociacao: "ABERTA", iaPassouEm: null, iaPassouTipo: null, temFichaFinanciamento: false, ...p };
}
const e = (s: SinaisDoLead) => estagioDoLead(s, agora);

// Quem escreveu.
assert.equal(autorDaMensagem({ direction: "INBOUND" }), "cliente");
assert.equal(autorDaMensagem({ direction: "OUTBOUND", senderUserId: "u1" }), "pessoa");
assert.equal(autorDaMensagem({ direction: "OUTBOUND", deCelular: true }), "pessoa");
assert.equal(autorDaMensagem({ direction: "OUTBOUND", referenciaExterna: "vendedor-ia:abc" }), "ia");
assert.equal(autorDaMensagem({ direction: "OUTBOUND" }), "automatica", "menu e saudação não são resposta");

// O que a IA identificou ao passar a conversa.
assert.equal(tipoDoMotivoDaIa("visita ou test drive"), "visita");
assert.equal(tipoDoMotivoDaIa("financiamento"), "negociar");
assert.equal(tipoDoMotivoDaIa("negociação"), "negociar");
assert.equal(tipoDoMotivoDaIa("troca"), "negociar");
assert.equal(tipoDoMotivoDaIa("pedido do cliente"), "negociar");
assert.equal(tipoDoMotivoDaIa("outro assunto"), null);
assert.equal(tipoDoMotivoDaIa("assumida por Felipe (dev)"), null, "o vendedor assumiu: não diz o que o cliente quer");
assert.equal(tipoDoMotivoDaIa("a IA ficou indisponível"), null);
assert.equal(tipoDoMotivoDaIa(null), null);

// NOVO: chegou há 5 min, ninguém falou. Ainda não "precisa de gente" (a IA/equipe tem 15 min).
let s = e(sinais({ recebidoEm: min(5) }));
assert.equal(s.estagio, "NOVO");
assert.equal(s.precisaDeGente, null);
// ...e passou de 15 min sem resposta: precisa de gente.
s = e(sinais({ recebidoEm: min(40) }));
assert.deepEqual([s.estagio, s.precisaDeGente?.motivo], ["NOVO", "sem_resposta"]);
// Só mensagem automática: continua NOVO.
s = e(sinais({ recebidoEm: min(60), mensagens: [msg("automatica", min(59))] }));
assert.deepEqual([s.estagio, s.respostaEm], ["NOVO", null]);
// Mensagem de ANTES do lead chegar não conta.
s = e(sinais({ recebidoEm: min(60), mensagens: [msg("pessoa", min(600))] }));
assert.equal(s.estagio, "NOVO");

// ABORDADO: a IA respondeu em 2 min e o cliente ainda não escreveu.
s = e(sinais({ recebidoEm: min(60), mensagens: [msg("ia", min(58))] }));
assert.deepEqual([s.estagio, s.respostaEm?.getTime(), s.precisaDeGente], ["ABORDADO", min(58).getTime(), null]);
// "Já respondi" (ligação) também abordou.
s = e(sinais({ recebidoEm: min(60), respondidoManualEm: min(30) }));
assert.equal(s.estagio, "ABORDADO");

// EM_CONVERSA: o cliente respondeu e a loja respondeu depois.
s = e(sinais({ recebidoEm: min(120), mensagens: [msg("ia", min(118)), msg("cliente", min(100)), msg("ia", min(99))] }));
assert.deepEqual([s.estagio, s.clienteEscreveu, s.precisaDeGente], ["EM_CONVERSA", true, null]);
// Cliente esperando há 40 min: precisa de gente.
s = e(sinais({ recebidoEm: min(120), mensagens: [msg("ia", min(118)), msg("cliente", min(40))] }));
assert.deepEqual([s.estagio, s.precisaDeGente?.motivo], ["EM_CONVERSA", "cliente_esperando"]);
// ...mas há 5 min ainda é normal.
s = e(sinais({ recebidoEm: min(120), mensagens: [msg("ia", min(118)), msg("cliente", min(5))] }));
assert.equal(s.precisaDeGente, null);
// O cliente chamou antes de qualquer resposta: já está em conversa (e esperando).
s = e(sinais({ recebidoEm: min(120), mensagens: [msg("cliente", min(100))] }));
assert.deepEqual([s.estagio, s.precisaDeGente?.motivo], ["EM_CONVERSA", "cliente_esperando"]);

// VISITA e NEGOCIAÇÃO vêm da IA; pessoa ainda não respondeu depois da passagem = precisa de gente.
s = e(sinais({ recebidoEm: min(300), mensagens: [msg("ia", min(290)), msg("cliente", min(200)), msg("ia", min(199))], iaPassouEm: min(150), iaPassouTipo: "visita" }));
assert.deepEqual([s.estagio, s.querAvancar, s.precisaDeGente?.motivo], ["VISITA", true, "ia_passou"]);
s = e(sinais({ recebidoEm: min(300), mensagens: [msg("ia", min(290)), msg("cliente", min(200)), msg("ia", min(199))], iaPassouEm: min(150), iaPassouTipo: "negociar" }));
assert.deepEqual([s.estagio, s.precisaDeGente?.motivo], ["NEGOCIACAO", "ia_passou"]);
// Quando uma pessoa responde depois da passagem, sai da lista de atenção mas continua no estágio.
s = e(sinais({ recebidoEm: min(300), mensagens: [msg("ia", min(290)), msg("cliente", min(200)), msg("pessoa", min(100))], iaPassouEm: min(150), iaPassouTipo: "negociar" }));
assert.deepEqual([s.estagio, s.precisaDeGente], ["NEGOCIACAO", null]);
// Pessoa que respondeu ANTES da passagem não resolve a passagem.
s = e(sinais({ recebidoEm: min(300), mensagens: [msg("pessoa", min(250)), msg("cliente", min(200))], iaPassouEm: min(150), iaPassouTipo: "negociar" }));
assert.equal(s.precisaDeGente?.motivo, "ia_passou");
// Ficha de financiamento = quer negociar, mesmo sem a IA.
s = e(sinais({ recebidoEm: min(300), mensagens: [msg("pessoa", min(290)), msg("cliente", min(280)), msg("pessoa", min(270))], temFichaFinanciamento: true }));
assert.deepEqual([s.estagio, s.querAvancar], ["NEGOCIACAO", true]);

// ESFRIOU: a loja falou por último há 4 dias.
s = e(sinais({ recebidoEm: dia(6), mensagens: [msg("ia", dia(6)), msg("cliente", dia(5)), msg("pessoa", dia(4))] }));
assert.equal(s.estagio, "ESFRIOU");
// Só 2 dias de silêncio: ainda em conversa.
s = e(sinais({ recebidoEm: dia(4), mensagens: [msg("ia", dia(4)), msg("cliente", dia(3)), msg("pessoa", dia(2))] }));
assert.equal(s.estagio, "EM_CONVERSA");
// Abordado que nunca respondeu e passou dias: esfriou também.
s = e(sinais({ recebidoEm: dia(5), mensagens: [msg("ia", dia(5))] }));
assert.equal(s.estagio, "ESFRIOU");
// Se o cliente é quem está esperando há dias, NÃO esfriou: está quente e sem resposta.
s = e(sinais({ recebidoEm: dia(6), mensagens: [msg("ia", dia(6)), msg("cliente", dia(4))] }));
assert.deepEqual([s.estagio, s.precisaDeGente?.motivo], ["EM_CONVERSA", "cliente_esperando"]);

// Negociação fechada manda: GANHO e PERDIDO nunca pedem atenção.
s = e(sinais({ recebidoEm: min(300), mensagens: [msg("cliente", min(100))], statusNegociacao: "GANHA" }));
assert.deepEqual([s.estagio, s.precisaDeGente], ["GANHO", null]);
s = e(sinais({ recebidoEm: min(300), statusNegociacao: "PERDIDA" }));
assert.deepEqual([s.estagio, s.precisaDeGente], ["PERDIDO", null]);

// Sem negociação (lead sem telefone): NOVO e, passado o prazo, sem resposta.
s = e(sinais({ recebidoEm: dia(2), statusNegociacao: null }));
assert.deepEqual([s.estagio, s.precisaDeGente?.motivo], ["NOVO", "sem_resposta"]);

// Última atividade: a mais recente entre chegada, mensagens e "já respondi".
s = e(sinais({ recebidoEm: min(60), mensagens: [msg("cliente", min(10))], respondidoManualEm: min(5) }));
assert.equal(s.ultimaAtividadeEm.getTime(), min(5).getTime());

console.log("estagio-lead: ok");
