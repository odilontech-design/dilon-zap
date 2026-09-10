// Tabela de decisão da resposta automática. Puro, sem banco.
// Rodar com: npx tsx apps/worker/src/auto-reply-decisao.test-manual.ts
import {
  automacaoPodeFalar,
  decidirAutoResposta,
  type EntradaDecisao,
  type OpcaoUra,
  type RegraAuto,
} from "./auto-reply-decisao";

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
    uraAtiva: false,
    uraMensagem: null,
    uraOpcoes: [],
    uraEnviadaEm: null,
    uraReenvios: 0,
    ...over,
  };
}

// Menu da Guttierres: três setores, cada um com o seu responsável.
const OPCOES: OpcaoUra[] = [
  { ordem: 1, rotulo: "Fiscal", atendenteId: "user-fiscal" },
  { ordem: 2, rotulo: "Contábil", atendenteId: "user-contabil" },
  { ordem: 3, rotulo: "Departamento Pessoal", atendenteId: "user-dp" },
];
const CABECALHO = "Olá! Sou o atendimento da Guttierres. Com qual setor você precisa falar?";
const MENU = `${CABECALHO}\n\n1 - Fiscal\n2 - Contábil\n3 - Departamento Pessoal`;
const MENU_DE_NOVO =
  "Não entendi. Responda com o número de uma das opções:\n\n1 - Fiscal\n2 - Contábil\n3 - Departamento Pessoal";

/** Conversa em que o menu já foi apresentado e esperamos a escolha. */
function comMenu(over: Partial<EntradaDecisao> = {}) {
  return cenario({
    uraAtiva: true,
    uraMensagem: CABECALHO,
    uraOpcoes: OPCOES,
    uraEnviadaEm: new Date("2026-09-01T14:59:00Z"),
    ...over,
  });
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

// ---------------------------------------------------------------------------
// Menu de triagem (URA): o cliente escolhe o setor e a conversa já nasce com
// dono. É o caso da Guttierres, que não tem ninguém lendo tudo que chega.
// ---------------------------------------------------------------------------

checa(
  "primeiro contato com menu ligado — recebe o menu (e conta como saudado)",
  decidirAutoResposta(
    cenario({ uraAtiva: true, uraMensagem: CABECALHO, uraOpcoes: OPCOES })
  ),
  { texto: MENU, marcarAusencia: false, marcarSaudacao: true, marcarUraEnviada: true }
);

checa(
  "menu ligado sem opção cadastrada — comporta-se como se não existisse",
  decidirAutoResposta(cenario({ uraAtiva: true, uraMensagem: CABECALHO, regras: [SAUDACAO] })),
  resposta(SAUDACAO.response, false, true)
);

checa(
  "menu desligado com opções cadastradas — segue a saudação de sempre",
  decidirAutoResposta(cenario({ uraOpcoes: OPCOES, regras: [SAUDACAO] })),
  resposta(SAUDACAO.response, false, true)
);

checa(
  "menu substitui a saudação, nunca manda os dois",
  decidirAutoResposta(
    cenario({ uraAtiva: true, uraMensagem: CABECALHO, uraOpcoes: OPCOES, regras: [SAUDACAO] })
  ),
  { texto: MENU, marcarAusencia: false, marcarSaudacao: true, marcarUraEnviada: true }
);

checa(
  "fora do horário, o aviso de ausência ainda vem antes do menu",
  decidirAutoResposta(
    cenario({
      uraAtiva: true,
      uraMensagem: CABECALHO,
      uraOpcoes: OPCOES,
      foraDoHorario: true,
      mensagemAusencia: AUSENCIA,
    })
  ),
  resposta(AUSENCIA, true, false)
);

checa(
  'cliente responde "2" — vai para o Contábil',
  decidirAutoResposta(comMenu({ textoRecebido: "2" })),
  {
    texto: "Certo! Encaminhando para Contábil. Já já alguém te responde por aqui.",
    marcarAusencia: false,
    marcarSaudacao: false,
    atribuirPara: "user-contabil",
  }
);

checa(
  'pontuação e espaço no meio ("  3) ") não atrapalham',
  decidirAutoResposta(comMenu({ textoRecebido: "  3) " })),
  {
    texto: "Certo! Encaminhando para Departamento Pessoal. Já já alguém te responde por aqui.",
    marcarAusencia: false,
    marcarSaudacao: false,
    atribuirPara: "user-dp",
  }
);

checa(
  "o nome do setor também vale como escolha, com ou sem acento",
  decidirAutoResposta(comMenu({ textoRecebido: "contabil" })),
  {
    texto: "Certo! Encaminhando para Contábil. Já já alguém te responde por aqui.",
    marcarAusencia: false,
    marcarSaudacao: false,
    atribuirPara: "user-contabil",
  }
);

checa(
  'número solto no meio da frase NÃO encaminha ("preciso de 1 boleto")',
  decidirAutoResposta(comMenu({ textoRecebido: "preciso de 1 boleto" })),
  { texto: MENU_DE_NOVO, marcarAusencia: false, marcarSaudacao: false, contarReenvioUra: true }
);

checa(
  "opção fora da lista cai no reenvio, não em encaminhamento errado",
  decidirAutoResposta(comMenu({ textoRecebido: "9" })),
  { texto: MENU_DE_NOVO, marcarAusencia: false, marcarSaudacao: false, contarReenvioUra: true }
);

checa(
  "insistiu em texto livre depois do reenvio — o robô se cala e a conversa fica na fila",
  decidirAutoResposta(comMenu({ textoRecebido: "quero falar com alguém", uraReenvios: 1 })),
  calado
);

checa(
  "mesmo depois de desistir de insistir, a escolha certa ainda encaminha",
  decidirAutoResposta(comMenu({ textoRecebido: "1", uraReenvios: 1 })),
  {
    texto: "Certo! Encaminhando para Fiscal. Já já alguém te responde por aqui.",
    marcarAusencia: false,
    marcarSaudacao: false,
    atribuirPara: "user-fiscal",
  }
);

checa(
  "escolha do menu ganha da palavra-chave de mesmo nome (senão ninguém seria acionado)",
  decidirAutoResposta(
    comMenu({ textoRecebido: "fiscal", regras: [{ ...PALAVRA, keyword: "fiscal" }] })
  ),
  {
    texto: "Certo! Encaminhando para Fiscal. Já já alguém te responde por aqui.",
    marcarAusencia: false,
    marcarSaudacao: false,
    atribuirPara: "user-fiscal",
  }
);

checa(
  "palavra-chave continua valendo pra quem escreve outra coisa durante o menu",
  decidirAutoResposta(comMenu({ textoRecebido: "qual o horário de vocês?", regras: [PALAVRA] })),
  resposta(PALAVRA.response)
);

checa(
  "cabeçalho vazio — manda só a lista de opções",
  decidirAutoResposta(cenario({ uraAtiva: true, uraMensagem: null, uraOpcoes: OPCOES })),
  {
    texto: "1 - Fiscal\n2 - Contábil\n3 - Departamento Pessoal",
    marcarAusencia: false,
    marcarSaudacao: true,
    marcarUraEnviada: true,
  }
);


// ---------------------------------------------------------------------------
// Setores: o pedido do Carlos, da Guttierres. A opcao aponta pra um setor e a
// conversa vai pra FILA dele, sem responsavel, pra equipe inteira enxergar.
// ---------------------------------------------------------------------------

const SETORES: OpcaoUra[] = [
  { ordem: 1, rotulo: "Fiscal", setorId: "setor-fiscal" },
  { ordem: 2, rotulo: "Contábil", setorId: "setor-contabil" },
  { ordem: 3, rotulo: "Falar com o Carlos", atendenteId: "user-carlos" },
];

/** Menu ja apresentado, com destinos por setor. */
function comSetores(over: Partial<EntradaDecisao> = {}) {
  return cenario({
    uraAtiva: true,
    uraMensagem: CABECALHO,
    uraOpcoes: SETORES,
    uraEnviadaEm: new Date("2026-09-01T14:59:00Z"),
    ...over,
  });
}

checa(
  'cliente responde "1" — vai para a FILA do Fiscal, sem responsavel',
  decidirAutoResposta(comSetores({ textoRecebido: "1" })),
  {
    texto: "Certo! Encaminhando para Fiscal. Já já alguém te responde por aqui.",
    marcarAusencia: false,
    marcarSaudacao: false,
    direcionarParaSetor: "setor-fiscal",
  }
);

checa(
  "o nome do setor tambem vale como escolha",
  decidirAutoResposta(comSetores({ textoRecebido: "contabil" })),
  {
    texto: "Certo! Encaminhando para Contábil. Já já alguém te responde por aqui.",
    marcarAusencia: false,
    marcarSaudacao: false,
    direcionarParaSetor: "setor-contabil",
  }
);

checa(
  "setor e pessoa convivem no mesmo menu — a opcao 3 continua indo pra uma pessoa",
  decidirAutoResposta(comSetores({ textoRecebido: "3" })),
  {
    texto: "Certo! Encaminhando para Falar com o Carlos. Já já alguém te responde por aqui.",
    marcarAusencia: false,
    marcarSaudacao: false,
    atribuirPara: "user-carlos",
  }
);

checa(
  "setor tem precedencia se os dois vierem preenchidos (nao deveria acontecer)",
  decidirAutoResposta(
    comSetores({
      textoRecebido: "1",
      uraOpcoes: [{ ordem: 1, rotulo: "Fiscal", setorId: "setor-fiscal", atendenteId: "user-x" }],
    })
  ),
  {
    texto: "Certo! Encaminhando para Fiscal. Já já alguém te responde por aqui.",
    marcarAusencia: false,
    marcarSaudacao: false,
    direcionarParaSetor: "setor-fiscal",
  }
);

checa(
  "opcao sem destino nenhum nao confirma encaminhamento — reapresenta o menu",
  decidirAutoResposta(
    comSetores({ textoRecebido: "1", uraOpcoes: [{ ordem: 1, rotulo: "Fiscal" }] })
  ),
  {
    texto: "Não entendi. Responda com o número de uma das opções:\n\n1 - Fiscal",
    marcarAusencia: false,
    marcarSaudacao: false,
    contarReenvioUra: true,
  }
);

// ---------------------------------------------------------------------------
// O guard. E a linha que, esquecida, faz o cliente encaminhado receber o menu
// de novo — porque encaminhar pro setor NAO preenche assignedToId.
// ---------------------------------------------------------------------------

checa(
  "conversa sem dono nenhum — o robo fala",
  automacaoPodeFalar({ assignedToId: null, setorId: null }),
  true
);

checa(
  "conversa com responsavel — o robo cala (comportamento de sempre)",
  automacaoPodeFalar({ assignedToId: "user-fiscal", setorId: null }),
  false
);

checa(
  "conversa NA FILA de um setor, sem responsavel — o robo tem que calar",
  automacaoPodeFalar({ assignedToId: null, setorId: "setor-fiscal" }),
  false
);

checa(
  "setor com responsavel ja definido — cala tambem",
  automacaoPodeFalar({ assignedToId: "user-fiscal", setorId: "setor-fiscal" }),
  false
);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
