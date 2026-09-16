// Isolamento de histórico entre setores. Puro. Rodar com:
// npx tsx apps/web/lib/historico-setor.test-manual.ts
import { filtrarHistoricoPorSetor } from "./historico-setor";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`
  );
}

const m = (id: string, setorId: string | null) => ({ id, setorId });

checa(
  "sem nenhum setor envolvido: tudo visível, nenhum marcador",
  filtrarHistoricoPorSetor([m("1", null), m("2", null)], new Set()),
  { visiveis: [m("1", null), m("2", null)], marcadores: [] }
);

checa(
  "só do meu setor: tudo visível",
  filtrarHistoricoPorSetor([m("1", "fiscal"), m("2", "fiscal")], new Set(["fiscal"])),
  { visiveis: [m("1", "fiscal"), m("2", "fiscal")], marcadores: [] }
);

checa(
  "conversa começou geral e foi pro meu setor: tudo visível, sem marcador — geral não é segredo de ninguém",
  filtrarHistoricoPorSetor([m("1", null), m("2", null), m("3", "fiscal")], new Set(["fiscal"])),
  { visiveis: [m("1", null), m("2", null), m("3", "fiscal")], marcadores: [] }
);

checa(
  "veio de outro setor: some o trecho antigo, marcador aponta pra primeira mensagem visível",
  filtrarHistoricoPorSetor(
    [m("1", "pessoal"), m("2", "pessoal"), m("3", "fiscal"), m("4", "fiscal")],
    new Set(["fiscal"])
  ),
  {
    visiveis: [m("3", "fiscal"), m("4", "fiscal")],
    marcadores: [{ antesDe: "3", setorId: "fiscal" }],
  }
);

checa(
  "ida e volta: Pessoal -> Fiscal -> Pessoal de novo. Quem é do Pessoal vê os dois trechos dele, não o do meio",
  filtrarHistoricoPorSetor(
    [m("1", "pessoal"), m("2", "fiscal"), m("3", "fiscal"), m("4", "pessoal")],
    new Set(["pessoal"])
  ),
  {
    visiveis: [m("1", "pessoal"), m("4", "pessoal")],
    marcadores: [{ antesDe: "4", setorId: "pessoal" }],
  }
);

checa(
  "quem está em dois setores enxerga os dois, sem marcador nenhum entre eles",
  filtrarHistoricoPorSetor(
    [m("1", "pessoal"), m("2", "fiscal")],
    new Set(["pessoal", "fiscal"])
  ),
  { visiveis: [m("1", "pessoal"), m("2", "fiscal")], marcadores: [] }
);

checa(
  "sem acesso a setor nenhum: só o que não tem setor sobra",
  filtrarHistoricoPorSetor([m("1", null), m("2", "fiscal"), m("3", null)], new Set()),
  { visiveis: [m("1", null), m("3", null)], marcadores: [{ antesDe: "3", setorId: null }] }
);

checa(
  "trecho escondido no fim da conversa: nada reaparece, nenhum marcador — ainda não voltou pra mim",
  filtrarHistoricoPorSetor([m("1", "pessoal"), m("2", "fiscal")], new Set(["pessoal"])),
  { visiveis: [m("1", "pessoal")], marcadores: [] }
);

checa("lista vazia", filtrarHistoricoPorSetor([], new Set(["fiscal"])), { visiveis: [], marcadores: [] });

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
