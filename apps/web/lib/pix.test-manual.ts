// BR Code do PIX: formato, limites e CRC. Puro, sem banco e sem rede.
// Chaves e nomes fictícios — nunca de cliente real.
// Rodar com: npx tsx apps/web/lib/pix.test-manual.ts
import { montarBrCode, crc16, sanitizar, normalizarChavePix } from "./pix";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}

/**
 * Quebra o código em campos. O leitor do banco faz exatamente isto: lê 2
 * dígitos de ID, 2 de tamanho, e pula. Se algum tamanho estiver errado, o
 * parser sai do passo e os campos seguintes saem embaralhados — por isso vale
 * mais conferir a estrutura assim do que comparar a string inteira.
 */
function campos(codigo: string): Record<string, string> {
  const saida: Record<string, string> = {};
  let i = 0;
  while (i < codigo.length) {
    const id = codigo.slice(i, i + 2);
    const tamanho = Number(codigo.slice(i + 2, i + 4));
    if (!Number.isFinite(tamanho)) throw new Error(`tamanho inválido no campo ${id}`);
    saida[id] = codigo.slice(i + 4, i + 4 + tamanho);
    i += 4 + tamanho;
  }
  return saida;
}

// Âncora externa de verdade: o vetor canônico do CRC-16/CCITT-FALSE. É o que
// garante que a VARIANTE do CRC é a certa — trocar por outra gera código que
// nenhum banco aceita, e nada no nosso lado acusaria.
checa("CRC-16/CCITT-FALSE do vetor canônico 123456789", crc16("123456789"), "29B1");

// Estrutura, campo a campo, no exemplo do manual do PIX.
const exemplo = montarBrCode({
  chave: "123e4567-e12b-12d1-a456-426655440000",
  nomeRecebedor: "Fulano de Tal",
  cidade: "BRASILIA",
});
const c = campos(exemplo);
checa("campo 00: versão do payload", c["00"], "01");
checa("campo 26: conta do recebedor", c["26"], "0014BR.GOV.BCB.PIX0136123e4567-e12b-12d1-a456-426655440000");
checa("campo 26 interno: GUI e chave", campos(c["26"]), {
  "00": "BR.GOV.BCB.PIX",
  "01": "123e4567-e12b-12d1-a456-426655440000",
});
checa("campo 52: categoria não informada", c["52"], "0000");
checa("campo 53: moeda real (986)", c["53"], "986");
checa("campo 58: país", c["58"], "BR");
checa("campo 59: nome do recebedor", c["59"], "Fulano de Tal");
checa("campo 60: cidade", c["60"], "BRASILIA");
checa("campo 62 interno: identificador", campos(c["62"]), { "05": "***" });
checa("campo 63: CRC tem 4 dígitos hexadecimais", /^[0-9A-F]{4}$/.test(c["63"]), true);
checa("o parser consome o código inteiro, sem sobra", Object.keys(c).sort().join(","), "00,26,52,53,58,59,60,62,63");
checa("CRC fecha o código do exemplo", crc16(exemplo.slice(0, -4)), exemplo.slice(-4));

// Valor: entra como campo 54, com dois decimais e ponto — nunca vírgula.
const comValor = montarBrCode({
  chave: "67211588000101",
  valorCents: 550000,
  nomeRecebedor: "Carlos Guttierres",
  cidade: "Rio de Janeiro",
});
checa("valor sai em reais com ponto decimal", comValor.includes("54075500.00"), true);
checa("sem valor, o campo 54 não existe", montarBrCode({ chave: "x", nomeRecebedor: "Y", cidade: "Z" }).includes("5407"), false);
checa("valor zero não vira campo 54", montarBrCode({ chave: "x", valorCents: 0, nomeRecebedor: "Y", cidade: "Z" }).includes("5407"), false);
checa(
  "centavos quebrados não perdem precisão",
  campos(montarBrCode({ chave: "x", valorCents: 123456, nomeRecebedor: "Y", cidade: "Z" }))["54"],
  "1234.56"
);
checa(
  "valor do exemplo da Guttierres sai certo",
  campos(comValor)["54"],
  "5500.00"
);

// O CRC fecha o código: recalcular o que veio antes tem que dar o mesmo fim.
checa("CRC confere no código com valor", crc16(comValor.slice(0, -4)), comValor.slice(-4));

// Acento e símbolo quebram a contagem de tamanho dos campos — e com ela o
// código inteiro. Por isso nome e cidade passam pelo sanitizador.
checa("acento vira letra sem acento", sanitizar("Contábil Serviços", 25), "Contabil Servicos");
checa("símbolo some", sanitizar("Guttierres & Cia. Ltda", 25), "Guttierres  Cia Ltda");
checa("nome corta em 25", sanitizar("A".repeat(40), 25).length, 25);
checa("cidade corta em 15", sanitizar("B".repeat(40), 15).length, 15);
checa("nome vazio vira RECEBEDOR", montarBrCode({ chave: "x", nomeRecebedor: "###", cidade: "Z" }).includes("5909RECEBEDOR"), true);
checa("cidade vazia vira BRASIL", montarBrCode({ chave: "x", nomeRecebedor: "Y", cidade: "###" }).includes("6006BRASIL"), true);

// Nome com acento tem que gerar tamanho coerente com o texto já sanitizado,
// senão o leitor do banco lê o campo seguinte no lugar errado.
const comAcento = montarBrCode({ chave: "x", nomeRecebedor: "José Antônio", cidade: "São Paulo" });
checa("tamanho do nome bate com o texto sem acento", comAcento.includes("5912Jose Antonio"), true);
checa("tamanho da cidade bate com o texto sem acento", comAcento.includes("6009Sao Paulo"), true);
checa("CRC confere mesmo com acento na entrada", crc16(comAcento.slice(0, -4)), comAcento.slice(-4));

// Chave: o padrão exige a forma canônica. CNPJ pontuado fazia o app do banco
// recusar o código inteiro — foi o caso real da Guttierres.
checa("CNPJ pontuado vira 14 dígitos", normalizarChavePix("67.211.588/0001-01"), "67211588000101");
checa("CPF pontuado vira 11 dígitos", normalizarChavePix("123.456.789-09"), "12345678909");
checa("CNPJ já limpo não muda", normalizarChavePix("67211588000101"), "67211588000101");
checa("e-mail vira minúsculo", normalizarChavePix("  Financeiro@Empresa.COM  "), "financeiro@empresa.com");
checa(
  "chave aleatória vira minúscula",
  normalizarChavePix("123E4567-E12B-12D1-A456-426655440000"),
  "123e4567-e12b-12d1-a456-426655440000"
);
checa("telefone pontuado mantém o +", normalizarChavePix("+55 (21) 96741-1481"), "+5521967411481");
checa("telefone com DDI sem + ganha o +", normalizarChavePix("5521967411481"), "+5521967411481");
// 11 dígitos sem "+" é CPF, não celular: chave de telefone no PIX sempre tem DDI.
checa("onze dígitos sem + é CPF", normalizarChavePix("21967411481"), "21967411481");
checa("formato desconhecido sai como veio", normalizarChavePix("minha-chave"), "minha-chave");

// O que de fato entra no código: campo 01, dentro do 26.
const comCnpjPontuado = montarBrCode({
  chave: "67.211.588/0001-01",
  valorCents: 100000,
  nomeRecebedor: "Carlos Guttierres",
  cidade: "BRASIL",
  identificador: "PEDIDO52",
});
checa(
  "o código carrega a chave já normalizada",
  campos(campos(comCnpjPontuado)["26"])["01"],
  "67211588000101"
);
checa("CRC continua fechando depois de normalizar", crc16(comCnpjPontuado.slice(0, -4)), comCnpjPontuado.slice(-4));
checa(
  "o tamanho do campo 26 acompanha a chave encurtada",
  campos(comCnpjPontuado)["26"].length,
  Number(comCnpjPontuado.slice(comCnpjPontuado.indexOf("26", 0) + 2, comCnpjPontuado.indexOf("26") + 4))
);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
