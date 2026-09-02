// Tabela de decisão da resposta automática. Puro, sem banco.
// Rodar com: npx tsx apps/worker/src/auto-reply-decisao.test-manual.ts
import { decidirAutoResposta, type EntradaDecisao, type RegraAuto } from "./auto-reply-decisao";

const SEIS_HORAS = 6 * 60 * 60 * 1000;
const AGORA = new Date("2026-09-01T15:00:00Z");

const PALAVRA: RegraAuto = {
  keyword: "horário",
  response: "Atendemos de segunda a sexta, das 8h às 18h.",
  isDefault: false,
  isGreeting: false,
};
const SAUDACAO: RegraAuto = {
  keyword: "",
  response: "Oi! Bem-vinda à Believe. Como podemos ajudar?",
  isDefault: false,
  isGreeting: true,
};
const PADRAO: RegraAuto = {
  keyword: "",
  response: "Recebemos sua mensagem, já já alguém responde.",
  isDefault: true,
  isGreeting: false,
};

const AUSENCIA = "Estamos fora do horário de atendimento.";

function cenario(over: Partial<EntradaDecisao>): EntradaDecisao {
  return {
    regras: [],
    textoRecebido: "bom dia",
    foraDoHorario: false,
    mensagemAusencia: null,
    ausenciaAvisadaEm: null,
    saudacaoEnviadaEm: null,
    agora: AGORA,
    ausenciaIntervaloMs: SEIS_HORAS,
    ...over,
  };
}

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}

const calado = null;
const resposta = (texto: string, marcarAusencia = false, marcarSaudacao = false) => ({
  texto,
  marcarAusencia,
  marcarSaudacao,
});

// ---------------------------------------------------------------------------
// O pedido da Camila: cliente novo que escreve só "bom dia".
// ---------------------------------------------------------------------------

checa(
  "sem regra nenhuma — fica calado",
  decidirAutoResposta(cenario({})),
  calado
);

checa(
  'só palavra-chave configurada — "bom dia" não casa, fica calado (o problema que a Camila relatou)',
  decidirAutoResposta(cenario({ regras: [PALAVRA] })),
  calado
);

checa(
  'com saudação — "bom dia" agora é respondido',
  decidirAutoResposta(cenario({ regras: [PALAVRA, SAUDACAO] })),
  resposta(SAUDACAO.response, false, true)
);

checa(
  "saudação vale pra qualquer texto, não só cumprimento",
  decidirAutoResposta(cenario({ regras: [SAUDACAO], textoRecebido: "tem o sérum de vitamina C?" })),
  resposta(SAUDACAO.response, false, true)
);

// ---------------------------------------------------------------------------
// Uma vez só por contato, para sempre.
// ---------------------------------------------------------------------------

checa(
  "quem já foi saudado não recebe de novo",
  decidirAutoResposta(
    cenario({ regras: [SAUDACAO], saudacaoEnviadaEm: new Date("2026-08-01T12:00:00Z") })
  ),
  calado
);

checa(
  "quem já foi saudado cai na resposta padrão, se houver",
  decidirAutoResposta(
    cenario({
      regras: [SAUDACAO, PADRAO],
      saudacaoEnviadaEm: new Date("2026-08-01T12:00:00Z"),
    })
  ),
  resposta(PADRAO.response)
);

// ---------------------------------------------------------------------------
// Ordem: palavra-chave > ausência > saudação > padrão.
// ---------------------------------------------------------------------------

checa(
  "palavra-chave ganha da saudação",
  decidirAutoResposta(
    cenario({ regras: [PALAVRA, SAUDACAO], textoRecebido: "qual o horário de vocês?" })
  ),
  resposta(PALAVRA.response)
);

checa(
  "palavra-chave ganha da ausência (é específica e útil a qualquer hora)",
  decidirAutoResposta(
    cenario({
      regras: [PALAVRA, SAUDACAO],
      textoRecebido: "qual o horário?",
      foraDoHorario: true,
      mensagemAusencia: AUSENCIA,
    })
  ),
  resposta(PALAVRA.response)
);

checa(
  "cliente novo às 22h leva a ausência, não a saudação",
  decidirAutoResposta(
    cenario({ regras: [SAUDACAO], foraDoHorario: true, mensagemAusencia: AUSENCIA })
  ),
  resposta(AUSENCIA, true, false)
);

checa(
  "e não perde a saudação: sem marcar nada, ela sai na primeira mensagem no expediente",
  decidirAutoResposta(cenario({ regras: [SAUDACAO], foraDoHorario: false })),
  resposta(SAUDACAO.response, false, true)
);

checa(
  "saudação ganha do padrão",
  decidirAutoResposta(cenario({ regras: [SAUDACAO, PADRAO] })),
  resposta(SAUDACAO.response, false, true)
);

checa(
  "sem saudação configurada, o padrão continua valendo como antes",
  decidirAutoResposta(cenario({ regras: [PALAVRA, PADRAO] })),
  resposta(PADRAO.response)
);

// ---------------------------------------------------------------------------
// Trava anti-spam da ausência continua de pé.
// ---------------------------------------------------------------------------

checa(
  "segundo aviso de ausência dentro de 6h — silêncio, mesmo com saudação pendente",
  decidirAutoResposta(
    cenario({
      regras: [SAUDACAO],
      foraDoHorario: true,
      mensagemAusencia: AUSENCIA,
      ausenciaAvisadaEm: new Date(AGORA.getTime() - 60 * 60 * 1000),
    })
  ),
  calado
);

checa(
  "passadas as 6h, avisa de novo",
  decidirAutoResposta(
    cenario({
      regras: [SAUDACAO],
      foraDoHorario: true,
      mensagemAusencia: AUSENCIA,
      ausenciaAvisadaEm: new Date(AGORA.getTime() - 7 * 60 * 60 * 1000),
    })
  ),
  resposta(AUSENCIA, true, false)
);

checa(
  "fora do horário sem mensagem de ausência configurada — segue o fluxo normal",
  decidirAutoResposta(cenario({ regras: [SAUDACAO], foraDoHorario: true, mensagemAusencia: null })),
  resposta(SAUDACAO.response, false, true)
);

// ---------------------------------------------------------------------------
// Armadilhas de keyword vazia. includes("") é sempre true: sem os guardas,
// saudação e padrão casariam como se fossem palavra-chave — e o padrão
// passaria na frente da ausência, que é justamente o contrário do combinado.
// ---------------------------------------------------------------------------

checa(
  "saudação não é confundida com palavra-chave (não marcaria o contato)",
  decidirAutoResposta(cenario({ regras: [SAUDACAO] })),
  resposta(SAUDACAO.response, false, true)
);

checa(
  "padrão com keyword vazia não fura a fila da ausência",
  decidirAutoResposta(
    cenario({ regras: [PADRAO], foraDoHorario: true, mensagemAusencia: AUSENCIA })
  ),
  resposta(AUSENCIA, true, false)
);

checa(
  "palavra-chave é case-insensitive nos dois lados",
  decidirAutoResposta(
    cenario({
      regras: [{ ...PALAVRA, keyword: "HORÁRIO" }],
      textoRecebido: "Bom dia, qual o Horário?",
    })
  ),
  resposta(PALAVRA.response)
);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
