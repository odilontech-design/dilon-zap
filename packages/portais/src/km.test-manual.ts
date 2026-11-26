// Km que parece número padrão: nenhum portal publica. Sem banco nem rede.
// Rodar com: npx tsx packages/portais/src/km.test-manual.ts
import { faltaKmReal, kmParecePadrao } from "./km";
import { montarOfertaNapista } from "./napista/mapa";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

checa("1 km num carro de 2015 parece número padrão", kmParecePadrao({ km: 1, anoModelo: 2015, kmInformado: true }, 2026), true);
checa("99 km num carro de 2024 (2 anos): parece padrão", kmParecePadrao({ km: 99, anoModelo: 2024 }, 2026), true);
checa("100 km já não bloqueia (limite)", kmParecePadrao({ km: 100, anoModelo: 2015 }, 2026), false);
checa("zero km de verdade (carro do ano): não bloqueia", [kmParecePadrao({ km: 0, anoModelo: 2026 }, 2026), kmParecePadrao({ km: 0, anoModelo: 2025 }, 2026)], [false, false]);
checa("km não informada é outra regra (não duplica)", kmParecePadrao({ km: 1, anoModelo: 2015, kmInformado: false }, 2026), false);
checa("km real de carro usado não bloqueia", kmParecePadrao({ km: 84203, anoModelo: 2015 }, 2026), false);
checa("mensagem diz o que fazer", /Veículos > Completar/.test(faltaKmReal({ km: 1, anoModelo: 2015 })), true);

const carro = { tipo: "CARRO", marca: "Chevrolet", modelo: "Classic", versao: "1.0 4P", anoFabricacao: 2014, anoModelo: 2015, km: 1, kmInformado: true, cor: "Cinza", combustivel: "Flex", cambio: "Manual", portas: 4, precoCents: 3_600_000, fotos: ["x"], opcionais: [], placa: "OTU5D85", descricao: null } as never;
const r = montarOfertaNapista(carro, "v1");
checa("NaPista: carro com 1 km não monta o anúncio e explica", !r.ok && r.faltando.some((f) => /quilometragem/i.test(f)), true);
checa("NaPista: com a km real monta o anúncio", montarOfertaNapista({ ...(carro as object), km: 84203 } as never, "v1").ok, true);

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntudo certo");
