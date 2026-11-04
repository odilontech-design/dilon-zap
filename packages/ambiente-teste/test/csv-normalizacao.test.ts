import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { lerCsv } from "../../sdr-core/src/csv";
import { IndiceDeEmpresas, mesclarPreenchendoVazios, type EmpresaConhecida } from "../../sdr-core/src/dedup";
import type { EmpresaNormalizada } from "../../sdr-core/src/normalizacao";
import { analisarArquivo } from "../../sdr-core/src/importacao";
import { sugerirMapeamento, validarMapeamento } from "../../sdr-core/src/mapeamento";
import {
  chaveDoNome,
  cnpjValido,
  digitosVerificadoresDoCnpj,
  formatarCnpj,
  normalizarCnae,
  normalizarCnpj,
  normalizarEmail,
  normalizarLinha,
  normalizarPorte,
  normalizarSite,
  normalizarTelefone,
  normalizarUf,
  tituloDoNome,
} from "../../sdr-core/src/normalizacao";
import { qualificar, segmentoCasa } from "../../sdr-core/src/qualificacao";
import { bloqueiosDaEmpresa, normalizarValorDeSupressao, type ListasDeSupressao } from "../../sdr-core/src/supressao";
import { esperaEntreTentativasMs } from "../../sdr-core/src/limites";
import { cnpjDe } from "./dados";

/** Sem banco e sem rede: só as regras. Todos os dados abaixo são fictícios. */

describe("leitura do CSV", () => {
  test("lê vírgula, ponto e vírgula, tab e barra vertical", () => {
    for (const d of [",", ";", "\t", "|"]) {
      const csv = lerCsv(`cnpj${d}nome${d}uf\n1${d}Empresa A${d}SP\n2${d}Empresa B${d}RJ\n`);
      assert.equal(csv.delimitador, d);
      assert.deepEqual(csv.cabecalho, ["cnpj", "nome", "uf"]);
      assert.equal(csv.linhas.length, 2);
      assert.deepEqual(csv.linhas[1].celulas, ["2", "Empresa B", "RJ"]);
    }
  });
  test("aceita BOM, aspas com separador, aspas escapadas e quebra de linha dentro do campo", () => {
    const csv = lerCsv('﻿nome;obs\r\n"Silva; Filhos";"disse ""oi"""\r\n"Linha\nquebrada";x\r\n');
    assert.deepEqual(csv.cabecalho, ["nome", "obs"]);
    assert.deepEqual(csv.linhas[0].celulas, ["Silva; Filhos", 'disse "oi"']);
    assert.deepEqual(csv.linhas[1].celulas, ["Linha\nquebrada", "x"]);
  });
  test("ignora linhas vazias e numera como a planilha, contando as em branco", () => {
    const csv = lerCsv("a;b\n\n1;2\n   ;  \n3;4\n");
    assert.deepEqual(csv.linhas.map((l) => l.numero), [3, 5]);
    assert.deepEqual(lerCsv("a;b\n1;2\n3;4").linhas.map((l) => l.numero), [2, 3]);
  });
  test("cabeçalho repetido ou vazio ganha sufixo para poder mapear", () => {
    assert.deepEqual(lerCsv("nome;nome;;x\n1;2;3;4\n").cabecalho, ["nome", "nome (2)", "coluna 3", "x"]);
  });
  test("recusa arquivo vazio, só com cabeçalho e com aspas abertas", () => {
    assert.throws(() => lerCsv(""), /vazio/);
    assert.throws(() => lerCsv("   \n  \n"), /vazio/);
    assert.throws(() => lerCsv("cnpj;nome\n"), /só tem o cabeçalho/);
    assert.throws(() => lerCsv('cnpj;nome\n1;"aberta\n'), /aspas/);
  });
  test("recusa excesso de colunas, de linhas e de tamanho", () => {
    assert.throws(() => lerCsv(`${Array.from({ length: 61 }, (_, i) => `c${i}`).join(";")}\n${Array(61).fill("x").join(";")}\n`), /colunas/);
    assert.throws(() => lerCsv(`a\n${Array.from({ length: 20_001 }, () => "x").join("\n")}\n`), /linhas/);
    assert.throws(() => lerCsv(`a\n${"x".repeat(5 * 1024 * 1024 + 10)}\n`), /MB/);
  });
});

describe("CNPJ", () => {
  test("aceita CNPJ numérico com e sem máscara", () => {
    assert.deepEqual(normalizarCnpj("11.222.333/0001-81"), { cnpj: "11222333000181" });
    assert.deepEqual(normalizarCnpj(" 11222333000181 "), { cnpj: "11222333000181" });
  });
  test("o exemplo oficial do CNPJ alfanumérico confere", () => {
    assert.equal(digitosVerificadoresDoCnpj("12ABC34501DE"), "35");
    assert.equal(cnpjValido("12ABC34501DE35"), true);
    assert.deepEqual(normalizarCnpj("12.ABC.345/01DE-35"), { cnpj: "12ABC34501DE35" });
    assert.equal(cnpjValido("12ABC34501DE36"), false);
  });
  test("recusa dígito verificador errado, tamanho errado e repetidos", () => {
    for (const ruim of ["11222333000182", "11222333000180", "123", "00000000000000", "11111111111111", "ABCDEFGHIJKLMN", "1122233300018", ""]) {
      assert.equal("erro" in normalizarCnpj(ruim), true, ruim);
    }
  });
  test("completa o zero que o Excel come, só se os dígitos fecharem", () => {
    const comZero = cnpjDe(12_345_678); // começa com zeros
    assert.equal(comZero.startsWith("0"), true);
    const semZero = comZero.replace(/^0+/, "");
    assert.deepEqual(normalizarCnpj(semZero), { cnpj: comZero, aviso: "CNPJ completado com zeros à esquerda" });
    // Mesmo tamanho, mas o completo não confere: recusa, não adivinha.
    assert.equal("erro" in normalizarCnpj("1234567890123"), true);
  });
  test("formata com máscara", () => assert.equal(formatarCnpj("11222333000181"), "11.222.333/0001-81"));
});

describe("normalização dos campos", () => {
  test("nome em maiúsculas vira título, sigla e preposição ficam certas", () => {
    assert.equal(tituloDoNome("CLÍNICA SÃO JOSÉ DE CAMPINAS LTDA"), "Clínica São José de Campinas LTDA");
    assert.equal(tituloDoNome("  padaria   do  zé  "), "Padaria do Zé");
    assert.equal(tituloDoNome("Café do iFood Ltda"), "Café do iFood Ltda"); // misto: fica como veio
  });
  test("chave do nome ignora acento, pontuação e sufixo societário", () => {
    const a = chaveDoNome("Clínica São José Ltda.");
    assert.equal(a, "clinica sao jose");
    assert.equal(chaveDoNome("CLINICA SAO JOSE LTDA ME"), a);
    assert.equal(chaveDoNome("clinica   sao jose - EIRELI"), a);
    assert.equal(chaveDoNome("Comércio S/A"), "comercio");
    assert.notEqual(chaveDoNome("Clínica São Pedro"), a);
  });
  test("telefone: celular, fixo, +55, parênteses, vários na célula", () => {
    assert.deepEqual(normalizarTelefone("(11) 99999-8888"), { valor: "5511999998888", aviso: undefined });
    assert.equal(normalizarTelefone("+55 11 3333-4444").valor, "551133334444");
    assert.equal(normalizarTelefone("011 3333 4444").valor, "551133334444");
    assert.equal(normalizarTelefone("(11) 3333-4444 / (11) 99999-8888").valor, "551133334444");
    assert.equal(normalizarTelefone("123 / (21) 98888-7777").valor, "5521988887777");
  });
  test("telefone inválido é descartado com aviso", () => {
    for (const ruim of ["12345", "(11) 89999-8888", "0800 123 4567", "(00) 99999-8888", "abc"]) {
      const r = normalizarTelefone(ruim);
      assert.equal(r.valor, null, ruim);
      assert.match(r.aviso ?? "", /telefone inválido/);
    }
  });
  test("e-mail em minúsculas, primeiro válido, inválido com aviso", () => {
    assert.equal(normalizarEmail("  Contato@Empresa.COM.br ").valor, "contato@empresa.com.br");
    assert.equal(normalizarEmail("x; vendas@empresa.com").valor, "vendas@empresa.com");
    assert.equal(normalizarEmail("sem-arroba.com").valor, null);
    assert.equal(normalizarEmail("a@b").valor, null);
  });
  test("site: acrescenta https, tira www e barra final, e não usa rede social como domínio", () => {
    assert.deepEqual(normalizarSite("www.Empresa.com.br/").valor, { site: "https://empresa.com.br", dominio: "empresa.com.br" });
    assert.deepEqual(normalizarSite("http://empresa.com.br/loja/?x=1#y").valor, { site: "https://empresa.com.br/loja", dominio: "empresa.com.br" });
    assert.deepEqual(normalizarSite("instagram.com/empresa").valor, { site: "https://instagram.com/empresa", dominio: null });
    assert.equal(normalizarSite("contato@empresa.com").valor, null);
    assert.equal(normalizarSite("javascript:alert(1)").valor, null);
    assert.equal(normalizarSite("sem espaco nao").valor, null);
    assert.equal(normalizarSite("semponto").valor, null);
  });
  test("UF por sigla ou por nome, cidade em título, porte e CNAE", () => {
    assert.equal(normalizarUf("sp").valor, "SP");
    assert.equal(normalizarUf("São Paulo").valor, "SP");
    assert.equal(normalizarUf("PARANÁ").valor, "PR");
    assert.equal(normalizarUf("XX").valor, null);
    assert.equal(normalizarPorte("Pequeno Porte").valor, "EPP");
    assert.equal(normalizarPorte("microempresa").valor, "ME");
    assert.equal(normalizarPorte("tamanho gigante").valor, null);
    assert.equal(normalizarCnae("47.11-3-02").valor, "4711302");
    assert.equal(normalizarCnae("4711").valor, null);
  });
  test("linha completa: tudo normalizado e a chave do nome calculada", () => {
    const r = normalizarLinha({
      cnpj: "11.222.333/0001-81", razaoSocial: "CLÍNICA SAO JOSÉ LTDA", telefone: "(11) 3333-4444", email: "CONTATO@clinica.com.br",
      site: "WWW.clinica.com.br", uf: "sao paulo", cidade: "SAO PAULO", segmento: " Clínicas ", porte: "ME", cnae: "8630-5/01",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.empresa, {
      cnpj: "11222333000181", razaoSocial: "Clínica Sao José LTDA", nomeFantasia: null, telefone: "551133334444", email: "contato@clinica.com.br",
      site: "https://clinica.com.br", dominio: "clinica.com.br", emailDominio: "clinica.com.br", uf: "SP", cidade: "Sao Paulo",
      segmento: "Clínicas", porte: "ME", cnae: "8630501", chaveNome: "clinica sao jose",
    });
  });
  test("CNPJ inválido rejeita a linha; sem nome rejeita; sem CNPJ só avisa", () => {
    const cnpjRuim = normalizarLinha({ cnpj: "11222333000182", razaoSocial: "X Ltda" });
    assert.equal(cnpjRuim.ok, false);
    assert.match(!cnpjRuim.ok ? cnpjRuim.erros.join() : "", /CNPJ inválido/);
    const semNome = normalizarLinha({ cnpj: "11222333000181" });
    assert.equal(semNome.ok, false);
    assert.match(!semNome.ok ? semNome.erros.join() : "", /razão social ou o nome fantasia/);
    const semCnpj = normalizarLinha({ razaoSocial: "Loja Sem Cnpj" });
    assert.equal(semCnpj.ok, true);
    assert.match(semCnpj.ok ? semCnpj.avisos.join() : "", /sem CNPJ/);
  });
  test("campo opcional inválido some com aviso, sem rejeitar a linha", () => {
    const r = normalizarLinha({ razaoSocial: "Loja Boa", telefone: "123", email: "x", uf: "ZZ", site: "a b" });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.empresa.telefone, null);
    assert.equal(r.avisos.some((a) => a.includes("telefone")), true);
    assert.equal(r.avisos.some((a) => a.includes("UF")), true);
  });
  test("nome só com símbolos é rejeitado e nome longo demais também", () => {
    assert.equal(normalizarLinha({ razaoSocial: "--- ..." }).ok, false);
    assert.equal(normalizarLinha({ razaoSocial: "A".repeat(201) }).ok, false);
  });
});

describe("mapeamento de colunas", () => {
  test("reconhece os nomes comuns, com e sem acento", () => {
    const m = sugerirMapeamento(["CNPJ", "Razão Social", "Nome Fantasia", "Telefone", "E-mail", "Site", "Estado", "Município", "Ramo", "Porte", "CNAE"]);
    assert.deepEqual(m, {
      cnpj: "CNPJ", razaoSocial: "Razão Social", nomeFantasia: "Nome Fantasia", telefone: "Telefone", email: "E-mail", site: "Site",
      uf: "Estado", cidade: "Município", segmento: "Ramo", porte: "Porte", cnae: "CNAE",
    });
  });
  test("uma coluna serve a um campo só", () => {
    const m = sugerirMapeamento(["Nome", "Empresa"]);
    assert.equal(m.razaoSocial, "Nome");
    assert.equal(Object.values(m).filter((v) => v === "Nome").length, 1);
  });
  test("recusa coluna inexistente, coluna repetida e falta de nome", () => {
    const cab = ["a", "b"];
    assert.match(validarMapeamento({ razaoSocial: "x" }, cab).erros.join(), /não existe/);
    assert.match(validarMapeamento({ razaoSocial: "a", cnpj: "a" }, cab).erros.join(), /mais de um campo/);
    assert.match(validarMapeamento({ cnpj: "a" }, cab).erros.join(), /razão social ou ao nome fantasia/);
    assert.match(validarMapeamento({ campoInventado: "a" }, cab).erros.join(), /desconhecido/);
    assert.deepEqual(validarMapeamento({ razaoSocial: "a", cnpj: "b" }, cab).erros, []);
  });
  test("o arquivo analisado só guarda as colunas mapeadas", () => {
    const a = analisarArquivo("cnpj;nome;obs secreta\n" + `${cnpjDe(1)};Empresa Um;nao guardar\n`);
    assert.equal(a.problemas.length, 0);
    assert.deepEqual(Object.keys(a.linhas[0].bruto).sort(), ["cnpj", "razaoSocial"]);
    assert.equal(JSON.stringify(a.linhas[0].bruto).includes("nao guardar"), false);
  });
  test("linha com colunas a mais é rejeitada", () => {
    const a = analisarArquivo(`cnpj;nome\n${cnpjDe(2)};Empresa;sobrou\n`);
    assert.equal(a.linhas[0].resultado.ok, false);
  });
});

const conhecida = (extra: Partial<EmpresaConhecida> & { id: string }): EmpresaConhecida => ({
  cnpj: null, razaoSocial: null, nomeFantasia: null, telefone: null, email: null, site: null, dominio: null, emailDominio: null,
  uf: null, cidade: null, segmento: null, porte: null, cnae: null, chaveNome: "", importacaoOrigemId: null, ...extra,
});
const nova = (extra: Partial<Parameters<IndiceDeEmpresas["achar"]>[0]>) => ({ cnpj: null, dominio: null, chaveNome: "", uf: null, cidade: null, ...extra });

describe("deduplicação", () => {
  test("o CNPJ vence tudo", () => {
    const i = new IndiceDeEmpresas([conhecida({ id: "a", cnpj: "11222333000181", chaveNome: "outro nome", uf: "RJ" })]);
    assert.deepEqual(i.achar(nova({ cnpj: "11222333000181", chaveNome: "nada a ver", uf: "SP" }))?.por, "CNPJ");
  });
  test("sem CNPJ, o site identifica", () => {
    const i = new IndiceDeEmpresas([conhecida({ id: "a", dominio: "clinica.com.br", chaveNome: "clinica a" })]);
    assert.equal(i.achar(nova({ dominio: "clinica.com.br", chaveNome: "outra coisa" }))?.por, "SITE");
  });
  test("sem CNPJ nem site, nome e estado identificam; cidade diferente separa", () => {
    const i = new IndiceDeEmpresas([conhecida({ id: "a", chaveNome: "clinica sao jose", uf: "SP", cidade: "Campinas" })]);
    assert.equal(i.achar(nova({ chaveNome: "clinica sao jose", uf: "SP", cidade: "campinas" }))?.por, "NOME_UF");
    assert.equal(i.achar(nova({ chaveNome: "clinica sao jose", uf: "SP" }))?.por, "NOME_UF");
    assert.equal(i.achar(nova({ chaveNome: "clinica sao jose", uf: "SP", cidade: "Santos" })), null);
    assert.equal(i.achar(nova({ chaveNome: "clinica sao jose", uf: "RJ" })), null);
  });
  test("sem estado, o nome sozinho não basta", () => {
    const i = new IndiceDeEmpresas([conhecida({ id: "a", chaveNome: "clinica sao jose", uf: "SP" })]);
    assert.equal(i.achar(nova({ chaveNome: "clinica sao jose" })), null);
  });
  test("dois CNPJs diferentes nunca são a mesma empresa, mesmo com site e nome iguais", () => {
    const i = new IndiceDeEmpresas([conhecida({ id: "matriz", cnpj: "11222333000181", dominio: "rede.com.br", chaveNome: "rede", uf: "SP" })]);
    assert.equal(i.achar(nova({ cnpj: "11222333000262", dominio: "rede.com.br", chaveNome: "rede", uf: "SP" })), null);
  });
  test("empresa sem CNPJ casa com linha que traz CNPJ, pelo site ou por nome e estado", () => {
    const i = new IndiceDeEmpresas([conhecida({ id: "a", dominio: "loja.com.br" }), conhecida({ id: "b", chaveNome: "padaria x", uf: "MG" })]);
    assert.equal(i.achar(nova({ cnpj: "11222333000181", dominio: "loja.com.br" }))?.empresa.id, "a");
    assert.equal(i.achar(nova({ cnpj: "11222333000181", chaveNome: "padaria x", uf: "MG" }))?.empresa.id, "b");
  });
});

describe("mesclagem sem sobrescrever", () => {
  const base = conhecida({ id: "a", cnpj: "11222333000181", razaoSocial: "Clínica A", uf: "SP", site: "https://a.com.br", dominio: "a.com.br" });
  const novo = (extra: Partial<EmpresaNormalizada>): EmpresaNormalizada => ({ cnpj: "11222333000181", razaoSocial: "Clínica A", nomeFantasia: null, telefone: null, email: null, site: null, dominio: null, emailDominio: null, uf: null, cidade: null, segmento: null, porte: null, cnae: null, chaveNome: "clinica a", ...extra });
  test("preenche só o que estava vazio", () => {
    const m = mesclarPreenchendoVazios(base, novo({ telefone: "5511999998888", cidade: "Campinas", email: "x@a.com.br", emailDominio: "a.com.br" }));
    assert.deepEqual(m.mudancas.map((c) => c.campo).sort(), ["cidade", "email", "telefone"]);
    assert.deepEqual(m.atualizacao, { telefone: "5511999998888", cidade: "Campinas", email: "x@a.com.br", emailDominio: "a.com.br" });
    assert.deepEqual(m.conflitos, []);
  });
  test("valor diferente num campo preenchido vira conflito e não é aplicado", () => {
    const m = mesclarPreenchendoVazios(base, novo({ uf: "RJ", razaoSocial: "Outro Nome", site: "https://b.com.br", dominio: "b.com.br" }));
    assert.deepEqual(m.conflitos.map((c) => c.campo).sort(), ["razaoSocial", "site", "uf"]);
    assert.deepEqual(m.atualizacao, {});
    assert.deepEqual(m.mudancas, []);
  });
  test("diferença só de caixa ou acento não é conflito", () => {
    const m = mesclarPreenchendoVazios(base, novo({ razaoSocial: "CLINICA a", uf: "sp" }));
    assert.deepEqual(m.conflitos, []);
  });
  test("o CNPJ chega a uma empresa que não tinha", () => {
    const semCnpj = conhecida({ id: "b", razaoSocial: "Loja", dominio: "loja.com.br" });
    assert.deepEqual(mesclarPreenchendoVazios(semCnpj, novo({ cnpj: "11222333000181" })).atualizacao.cnpj, "11222333000181");
  });
});

describe("qualificação por regras", () => {
  const perfil = { segmentos: ["Clínicas"], cnaes: ["8630501"], ufs: ["SP", "RJ"], cidades: [], portes: ["ME", "EPP"], criterios: [{ nome: "Atende pelo WhatsApp", peso: 5, obrigatorio: false }] };
  const empresa = (extra: object) => ({ uf: "SP", cidade: null, porte: "ME", cnae: "8630501", segmento: "Clínica médica", ...extra });

  test("tudo atendido: qualificada, 100 de pontuação, critério livre fica não verificado", () => {
    const r = qualificar(empresa({}), perfil);
    assert.equal(r.status, "QUALIFICADO");
    assert.equal(r.pontuacao, 100);
    const livre = r.criterios.find((c) => c.tipo === "personalizado")!;
    assert.equal(livre.situacao, "NAO_VERIFICADO");
    // A cobertura não finge que o critério livre foi avaliado: 15 de 20 pontos.
    assert.equal(r.cobertura, 75);
  });
  test("critério obrigatório não atendido elimina, e a justificativa diz qual", () => {
    const r = qualificar(empresa({ uf: "MG" }), perfil);
    assert.equal(r.status, "NAO_QUALIFICADO");
    const uf = r.criterios.find((c) => c.chave === "uf")!;
    assert.equal(uf.situacao, "NAO_ATENDIDO");
    assert.match(uf.justificativa, /não está entre os do perfil/);
  });
  test("dado ausente no CSV não é atendido nem reprovado: pede verificação", () => {
    const r = qualificar(empresa({ cnae: null }), perfil);
    assert.equal(r.status, "VERIFICAR");
    assert.equal(r.criterios.find((c) => c.chave === "cnae")!.situacao, "DESCONHECIDO");
    assert.notEqual(r.pontuacao, null);
  });
  test("segmento, que é texto livre, pondera mas não elimina", () => {
    const r = qualificar(empresa({ segmento: "Padaria" }), perfil);
    assert.equal(r.criterios.find((c) => c.chave === "segmento")!.situacao, "NAO_ATENDIDO");
    assert.equal(r.status, "QUALIFICADO"); // 11 de 15 = 73% >= 60
    assert.equal(r.pontuacao, 73);
    const fraco = qualificar(empresa({ segmento: "Padaria" }), { ...perfil, portes: ["ME"], cnaes: [], ufs: [] });
    assert.equal(fraco.pontuacao, 43); // porte 3 de (3 + segmento 4)
    assert.equal(fraco.status, "NAO_QUALIFICADO");
  });
  test("critério livre obrigatório impede qualificar sem verificação", () => {
    const r = qualificar(empresa({}), { ...perfil, criterios: [{ nome: "Tem equipe", peso: 5, obrigatorio: true }] });
    assert.equal(r.status, "VERIFICAR");
  });
  test("perfil sem nada avaliável não inventa pontuação", () => {
    const r = qualificar(empresa({}), { segmentos: [], cnaes: [], ufs: [], cidades: [], portes: [], criterios: [] });
    assert.equal(r.status, "VERIFICAR");
    assert.equal(r.pontuacao, null);
    assert.equal(r.cobertura, 0);
  });
  test("o mesmo resultado sempre (determinístico)", () => {
    assert.deepEqual(qualificar(empresa({}), perfil), qualificar(empresa({}), perfil));
  });
  test("segmento casa por começo de palavra, sem acento", () => {
    assert.equal(segmentoCasa("Clínica médica", "Clínicas"), true);
    assert.equal(segmentoCasa("Contabilidade e fiscal", "Contabilidade"), true);
    assert.equal(segmentoCasa("Padaria", "Clínicas"), false);
  });
});

describe("supressão (regras puras)", () => {
  const listas = (): ListasDeSupressao => ({ CNPJ: new Map(), DOMINIO: new Map(), EMAIL: new Map(), TELEFONE: new Map() });
  const vazia = { cnpj: null, dominio: null, emailDominio: null, email: null, telefone: null };

  test("normaliza o valor pelo tipo", () => {
    assert.deepEqual(normalizarValorDeSupressao("CNPJ", "11.222.333/0001-81"), { valor: "11222333000181" });
    assert.deepEqual(normalizarValorDeSupressao("EMAIL", " Fulano@Empresa.COM "), { valor: "fulano@empresa.com" });
    assert.deepEqual(normalizarValorDeSupressao("TELEFONE", "(11) 99999-8888"), { valor: "5511999998888" });
    assert.deepEqual(normalizarValorDeSupressao("DOMINIO", "https://www.Empresa.com.br/loja"), { valor: "empresa.com.br" });
  });
  test("recusa valor inválido e provedor de e-mail como domínio", () => {
    assert.equal("erro" in normalizarValorDeSupressao("CNPJ", "123"), true);
    assert.equal("erro" in normalizarValorDeSupressao("EMAIL", "x"), true);
    assert.equal("erro" in normalizarValorDeSupressao("TELEFONE", "12"), true);
    assert.equal("erro" in normalizarValorDeSupressao("DOMINIO", "gmail.com"), true);
    assert.equal("erro" in normalizarValorDeSupressao("DOMINIO", "semponto"), true);
  });
  test("bate por CNPJ, domínio do site, domínio do e-mail, e-mail e telefone", () => {
    const l = listas();
    l.CNPJ.set("11222333000181", "EMPRESA_BLOQUEADA");
    l.DOMINIO.set("rede.com.br", "OPOSICAO");
    l.EMAIL.set("a@b.com", "SOLICITOU_NAO_CONTATO");
    l.TELEFONE.set("5511999998888", "RESTRICAO");
    assert.equal(bloqueiosDaEmpresa({ ...vazia, cnpj: "11222333000181" }, l)[0].motivo, "EMPRESA_BLOQUEADA");
    assert.equal(bloqueiosDaEmpresa({ ...vazia, dominio: "rede.com.br" }, l)[0].motivo, "OPOSICAO");
    assert.equal(bloqueiosDaEmpresa({ ...vazia, emailDominio: "rede.com.br" }, l)[0].motivo, "OPOSICAO");
    assert.equal(bloqueiosDaEmpresa({ ...vazia, email: "a@b.com" }, l)[0].motivo, "SOLICITOU_NAO_CONTATO");
    assert.equal(bloqueiosDaEmpresa({ ...vazia, telefone: "5511999998888" }, l)[0].motivo, "RESTRICAO");
    assert.deepEqual(bloqueiosDaEmpresa({ ...vazia, cnpj: "99999999000191", dominio: "livre.com" }, l), []);
  });
  test("espera entre tentativas dobra", () => {
    assert.deepEqual([1, 2, 3].map(esperaEntreTentativasMs), [30_000, 60_000, 120_000]);
  });
});
