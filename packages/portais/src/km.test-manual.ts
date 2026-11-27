// Km que parece número padrão: nenhum portal publica. Sem banco nem rede.
// Rodar com: npx tsx packages/portais/src/km.test-manual.ts
import { faltaKmReal, kmParecePadrao } from "./km";
import { montarOfertaNapista } from "./napista/mapa";
import { montarAnuncioWebmotors } from "./webmotors/mapa";
import { ambientesDosPortais, ehEnderecoDeTeste } from "./ambientes";

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
const sem1 = montarOfertaNapista(carro, "v1");
checa("NaPista: 1 km num carro antigo espera, com o motivo (não envia número inventado)", !sem1.ok && sem1.faltando.some((f) => /quilometragem/i.test(f)), true);
const semKm = montarOfertaNapista({ ...(carro as object), km: 0, kmInformado: false } as never, "v1");
checa("NaPista: sem km informada espera e diz que o NaPista exige", !semKm.ok && semKm.faltando.some((f) => /NaPista exige a quilometragem/.test(f)), true);
const real = montarOfertaNapista({ ...(carro as object), km: 84203 } as never, "v1");
checa("NaPista: com a km real, vai a km", real.ok && real.oferta.mileage, 84203);
const wm = montarAnuncioWebmotors(carro, { marca: "1", modelo: "2", versao: "3" } as never, null, 0);
checa("Webmotors (exige a km): 1 km num carro antigo continua bloqueado, com o motivo", !wm.ok && wm.faltando.some((f) => /quilometragem/i.test(f)), true);

// Ambientes dos portais: teste x produção pelo endereço.
checa("endereços de teste são reconhecidos", [ehEnderecoDeTeste("https://api.development.napista.com.br/seller-inventory-api"), ehEnderecoDeTeste("https://hportal.webmotors.com.br/IntegracaoRevendedor"), ehEnderecoDeTeste("http://localhost:3000")], [true, true, true]);
checa("endereços de produção não são de teste", [ehEnderecoDeTeste("https://api.napista.com.br/seller-inventory-api"), ehEnderecoDeTeste("https://integracao.webmotors.com.br"), ehEnderecoDeTeste("https://open-api.mobiauto.com.br"), ehEnderecoDeTeste("https://apps.olx.com.br"), ehEnderecoDeTeste("https://api.mercadolibre.com")], [false, false, false, false, false]);
delete process.env.NAPISTA_AMBIENTE;
delete process.env.WEBMOTORS_URL_BASE;
checa("sem variáveis, nenhum portal está em teste", ambientesDosPortais().filter((a) => a.teste).map((a) => a.portal), []);
process.env.NAPISTA_AMBIENTE = "development";
process.env.WEBMOTORS_URL_BASE = "";
checa("NaPista em desenvolvimento é apontado; variável vazia da Webmotors cai na produção (o compose passa vazio)", ambientesDosPortais().filter((a) => a.teste).map((a) => a.portal), ["NAPISTA"]);
process.env.WEBMOTORS_URL_BASE = "https://hportal.webmotors.com.br/IntegracaoRevendedor";
checa("Webmotors em homologação é apontada", ambientesDosPortais().filter((a) => a.teste).map((a) => a.portal), ["WEBMOTORS", "NAPISTA"]);

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntudo certo");
