// Ramos de visibilidade de conversa. Puro. Rodar com:
// npx tsx apps/web/lib/conversation-access.test-manual.ts
import { ramosDeVisibilidade } from "./conversation-access";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n      obtido   ${JSON.stringify(obtido)}\n      esperado ${JSON.stringify(esperado)}`}`
  );
}

const MINHA = { assignedToId: "eu" };
const FILA_GERAL = { assignedToId: null, setorId: null };
const GRUPO = { contact: { grupo: true } };

checa(
  "empresa sem setores e sem restrição: minha + fila geral + grupos",
  ramosDeVisibilidade({ userId: "eu", setorIds: [], filaGeralRestrita: false }),
  [MINHA, FILA_GERAL, GRUPO]
);

checa(
  "com setor e sem restrição: entra também a fila do meu setor",
  ramosDeVisibilidade({ userId: "eu", setorIds: ["fiscal"], filaGeralRestrita: false }),
  [MINHA, FILA_GERAL, { assignedToId: null, setorId: { in: ["fiscal"] } }, GRUPO]
);

checa(
  "fila geral restrita: o ramo da fila geral some, o do meu setor fica",
  ramosDeVisibilidade({ userId: "eu", setorIds: ["fiscal"], filaGeralRestrita: true }),
  [MINHA, { assignedToId: null, setorId: { in: ["fiscal"] } }, GRUPO]
);

checa(
  "fila geral restrita e eu sem setor nenhum: sobra só o que é meu e os grupos",
  ramosDeVisibilidade({ userId: "eu", setorIds: [], filaGeralRestrita: true }),
  [MINHA, GRUPO]
);

checa(
  "em dois setores: os dois entram no mesmo ramo",
  ramosDeVisibilidade({ userId: "eu", setorIds: ["fiscal", "dp"], filaGeralRestrita: true }),
  [MINHA, { assignedToId: null, setorId: { in: ["fiscal", "dp"] } }, GRUPO]
);

// A conversa que É minha nunca depende de setor nem da fila geral: é o ramo
// que garante que ninguém perde de vista o próprio atendimento depois de uma
// transferência de setor.
checa(
  "o ramo do que é meu é sempre o primeiro, em qualquer combinação",
  [
    ramosDeVisibilidade({ userId: "eu", setorIds: [], filaGeralRestrita: true })[0],
    ramosDeVisibilidade({ userId: "eu", setorIds: ["x"], filaGeralRestrita: false })[0],
  ],
  [MINHA, MINHA]
);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
