// Ficha do carro para o cliente: completa (botão do Inbox) e enxuta (Vendedor IA).
// Rodar com: npx tsx src/ficha.test-manual.ts
import assert from "node:assert/strict";
import { destacarOpcionais, fichaParaCliente, type CarroParaFicha } from "./ficha";

const OPC = ["Ar quente", "Ar condicionado", "Retrovisores elétricos", "Vidros elétricos", "Alarme", "Desembaçador traseiro", "Freios ABS", "Rodas de liga leve", "Travas elétricas", "Limpador traseiro", "Direção Elétrica", "Multimídia", "Porta copos", "Câmera de ré", "Banco de couro", "Bluetooth"];
const carro: CarroParaFicha = { marca: "Citroen", modelo: "C4 CACTUS", versao: "1.6", anoFabricacao: 2019, anoModelo: 2020, km: 50_000, kmInformado: true, cambio: "Automático", combustivel: "Flex", cor: "Prata", opcionais: OPC, precoCents: 7_500_000, precoOculto: true, kmOculto: true, placa: "ABC1D28" };

// Completa: não mudou (o Inbox segue igual).
const completa = fichaParaCliente(carro);
assert.match(completa, /Valor sob consulta/);
assert.match(completa, /Km n\/a/);
assert.ok(completa.includes(OPC.join(", ")), "completa traz todos os opcionais");

// Enxuta: sem as linhas sem informação, e com no máximo 8 opcionais.
const enxuta = fichaParaCliente(carro, { enxuta: true });
assert.doesNotMatch(enxuta, /sob consulta/i);
assert.doesNotMatch(enxuta, /Km n\/a/);
assert.doesNotMatch(enxuta, /R\$/, "preço oculto não aparece");
assert.match(enxuta, /^\*Citroen C4 CACTUS 1\.6 2019\/2020\*/);
const linhaOpc = enxuta.split("\n").find((l) => l.startsWith("✅"))!;
assert.equal(linhaOpc.replace("✅ ", "").split(", ").length, 8);
assert.match(linhaOpc, /Ar condicionado/);
assert.match(linhaOpc, /Câmera de ré/);
assert.match(linhaOpc, /Banco de couro/);
assert.doesNotMatch(linhaOpc, /Porta copos/, "o que pesa menos fica de fora");
assert.match(enxuta, /Final de placa 8/);

// Preço e km divulgados continuam aparecendo na enxuta.
const aberta = fichaParaCliente({ ...carro, precoOculto: false, kmOculto: false }, { enxuta: true });
assert.match(aberta, /R\$\s?75\.000,00/);
assert.match(aberta, /50\.000 km/);

// Pouco opcional: não corta nem inventa.
assert.deepEqual(destacarOpcionais(["Alarme", "Ar condicionado"]), ["Ar condicionado", "Alarme"]);
assert.deepEqual(destacarOpcionais([]), []);
// km não informada: sem linha de km (já era assim).
assert.doesNotMatch(fichaParaCliente({ ...carro, kmOculto: false, kmInformado: false }, { enxuta: true }), /km/i);

console.log("ficha: ok");
