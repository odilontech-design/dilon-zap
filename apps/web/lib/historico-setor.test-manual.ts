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
  "sem nenhum setor envolvido: tudo visível",
  filtrarHistoricoPorSetor([m("1", null), m("2", null)], new Set()),
  { visiveis: [m("1", null), m("2", null)], escondeu: false }
);

checa(
  "só do meu setor: tudo visível",
  filtrarHistoricoPorSetor([m("1", "fiscal"), m("2", "fiscal")], new Set(["fiscal"])),
  { visiveis: [m("1", "fiscal"), m("2", "fiscal")], escondeu: false }
);

checa(
  "conversa começou geral e foi pro meu setor: tudo visível — geral não é segredo de ninguém",
  filtrarHistoricoPorSetor([m("1", null), m("2", null), m("3", "fiscal")], new Set(["fiscal"])),
  { visiveis: [m("1", null), m("2", null), m("3", "fiscal")], escondeu: false }
);

checa(
  "veio de outro setor: some o trecho antigo",
  filtrarHistoricoPorSetor(
    [m("1", "pessoal"), m("2", "pessoal"), m("3", "fiscal"), m("4", "fiscal")],
    new Set(["fiscal"])
  ),
  { visiveis: [m("3", "fiscal"), m("4", "fiscal")], escondeu: true }
);

checa(
  "ida e volta: Pessoal -> Fiscal -> Pessoal de novo. Quem é do Pessoal vê os dois trechos dele, não o do meio",
  filtrarHistoricoPorSetor(
    [m("1", "pessoal"), m("2", "fiscal"), m("3", "fiscal"), m("4", "pessoal")],
    new Set(["pessoal"])
  ),
  { visiveis: [m("1", "pessoal"), m("4", "pessoal")], escondeu: true }
);

checa(
  "quem está em dois setores enxerga os dois",
  filtrarHistoricoPorSetor([m("1", "pessoal"), m("2", "fiscal")], new Set(["pessoal", "fiscal"])),
  { visiveis: [m("1", "pessoal"), m("2", "fiscal")], escondeu: false }
);

checa(
  "sem acesso a setor nenhum: só o que não tem setor sobra",
  filtrarHistoricoPorSetor([m("1", null), m("2", "fiscal"), m("3", null)], new Set()),
  { visiveis: [m("1", null), m("3", null)], escondeu: true }
);

checa(
  "trecho escondido no fim da conversa: some do mesmo jeito",
  filtrarHistoricoPorSetor([m("1", "pessoal"), m("2", "fiscal")], new Set(["pessoal"])),
  { visiveis: [m("1", "pessoal")], escondeu: true }
);

checa(
  "transferida pra mim antes de qualquer mensagem minha: não sobra nada visível, e a tela precisa saber disso",
  filtrarHistoricoPorSetor([m("1", "fiscal"), m("2", "fiscal")], new Set(["pessoal"])),
  { visiveis: [], escondeu: true }
);

checa("lista vazia", filtrarHistoricoPorSetor([], new Set(["fiscal"])), { visiveis: [], escondeu: false });

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
