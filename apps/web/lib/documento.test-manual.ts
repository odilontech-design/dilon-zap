// CPF e CNPJ: dígito verificador, formato e os casos que um robô digita.
// Documentos fictícios de propósito — nunca de cliente real.
// Rodar com: npx tsx apps/web/lib/documento.test-manual.ts
import { cpfValido, cnpjValido, documentoValido, tipoDoDocumento, formatarDocumentoBR, somenteDigitos } from "./documento";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}

// Gerados pela própria regra do módulo 11, não copiados de ninguém.
const CPF_OK = "52998224725";
const CNPJ_OK = "11222333000181";

checa("CPF válido", cpfValido(CPF_OK), true);
checa("CPF válido pontuado", cpfValido("529.982.247-25"), true);
checa("CPF com dígito trocado", cpfValido("52998224726"), false);
checa("CPF curto", cpfValido("5299822472"), false);
checa("CPF longo", cpfValido("529982247251"), false);
checa("CPF vazio", cpfValido(""), false);
checa("CPF com letras", cpfValido("abcdefghijk"), false);

// Repetidos passam na conta do módulo 11 e são o que o robô escreve primeiro.
for (const repetido of ["00000000000", "11111111111", "99999999999"]) {
  checa(`CPF repetido ${repetido} é recusado`, cpfValido(repetido), false);
}

checa("CNPJ válido", cnpjValido(CNPJ_OK), true);
checa("CNPJ válido pontuado", cnpjValido("11.222.333/0001-81"), true);
checa("CNPJ com dígito trocado", cnpjValido("11222333000182"), false);
checa("CNPJ curto", cnpjValido("1122233300018"), false);
checa("CNPJ repetido é recusado", cnpjValido("11111111111111"), false);

// Um não pode ser aceito no lugar do outro: tamanho é o que separa.
checa("CPF não passa como CNPJ", cnpjValido(CPF_OK), false);
checa("CNPJ não passa como CPF", cpfValido(CNPJ_OK), false);

checa("tipo de CPF", tipoDoDocumento(CPF_OK), "CPF");
checa("tipo de CNPJ", tipoDoDocumento(CNPJ_OK), "CNPJ");
checa("tipo de lixo", tipoDoDocumento("123"), null);
checa("documentoValido aceita os dois", [documentoValido(CPF_OK), documentoValido(CNPJ_OK)], [true, true]);
checa("documentoValido recusa lixo", documentoValido("00000000000"), false);

checa("só dígitos tira pontuação", somenteDigitos("11.222.333/0001-81"), "11222333000181");
checa("formata CPF", formatarDocumentoBR(CPF_OK), "529.982.247-25");
checa("formata CNPJ", formatarDocumentoBR(CNPJ_OK), "11.222.333/0001-81");
checa("formato desconhecido sai como veio", formatarDocumentoBR("123"), "123");

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
