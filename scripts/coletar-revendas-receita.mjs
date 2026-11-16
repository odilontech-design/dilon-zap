#!/usr/bin/env node
/**
 * Lista de revendas de automóveis (RJ e SP) a partir dos DADOS ABERTOS do CNPJ da Receita Federal, para importar no SDR.
 *
 *   node scripts/coletar-revendas-receita.mjs <pasta de trabalho> <pasta de saída> [AAAA-MM] [UFs, ex.: RJ,SP]
 *
 * Fonte pública e gratuita (https://dados.gov.br/dados/conjuntos-dados/cadastro-nacional-da-pessoa-juridica---cnpj).
 * Baixa um arquivo por vez (cerca de 7 GB no total), lê em fluxo, guarda só as revendas e APAGA o arquivo. Nada é enviado
 * a ninguém e nenhuma empresa é contatada: o resultado são planilhas CSV, que a pessoa importa no SDR (aba Importações).
 *
 * Só matriz, situação "ativa", CNAE principal 4511-1/02 (revenda de usados) ou 4511-1/01 (concessionária de novos), com
 * telefone ou e-mail. Ordenada para as melhores ficarem no começo: usados antes de novos, celular (WhatsApp), e-mail,
 * porte maior e empresa mais antiga. Dado do cadastro é o que a empresa informou à Receita: pode estar desatualizado, e o
 * e-mail muitas vezes é o do contador.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const [pastaDeTrabalho, pastaDeSaida, mesArg, ufsArg] = process.argv.slice(2);
if (!pastaDeTrabalho || !pastaDeSaida) {
  console.error("uso: node scripts/coletar-revendas-receita.mjs <pasta de trabalho> <pasta de saída> [AAAA-MM] [UFs]");
  process.exit(1);
}
const MES = mesArg ?? "2026-10";
const UFS = new Set((ufsArg ?? "RJ,SP").split(",").map((u) => u.trim().toUpperCase()));
// O token do compartilhamento é público (está no endereço da página de dados abertos da Receita), não é segredo.
const BASE = `https://arquivos.receitafederal.gov.br/public.php/webdav/${MES}`;
const TOKEN = "YggdBLfdninEJX9:";
const CNAES = { 4511102: "Revenda de veículos usados", 4511101: "Concessionária de veículos novos" };
const LINHAS_POR_ARQUIVO = 2000;
const EMAIL_DE_CONTADOR = /contab|contador|contadora|assessoria|escritorio|escritório|fiscal@|contabil/i;

fs.mkdirSync(pastaDeTrabalho, { recursive: true });
fs.mkdirSync(pastaDeSaida, { recursive: true });
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

/* ------------------------------------------------------------------ rede e zip ---- */

function executar(comando, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(comando, args, { stdio: ["ignore", "ignore", "inherit"] });
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`${comando} saiu com ${c}`))));
  });
}

async function baixar(nome) {
  const destino = path.join(pastaDeTrabalho, nome);
  for (let tentativa = 1; tentativa <= 6; tentativa++) {
    try {
      // O servidor da Receita não aceita retomar download (sem byte ranges): recomeça sempre do zero.
      fs.rmSync(destino, { force: true });
      await executar("curl", ["-sS", "-L", "-f", "-u", TOKEN, "--connect-timeout", "30", "--retry", "3", "--retry-delay", "5", "-o", destino, `${BASE}/${nome}`]);
      return destino;
    } catch (e) {
      log(`  falha ao baixar ${nome} (tentativa ${tentativa}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 10_000 * tentativa));
    }
  }
  throw new Error(`não consegui baixar ${nome}`);
}

/** Lê as linhas de dentro do zip, em fluxo, sem gravar o arquivo descompactado. */
async function lerZip(arquivo, aoLer) {
  // No Windows, o tar do Git (GNU) não lê zip e trata "C:" como máquina remota: usa o bsdtar do sistema. Nos outros, unzip.
  const [programa, args] = process.platform === "win32" ? [path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-xOf", arquivo]] : ["unzip", ["-p", arquivo]];
  const tar = spawn(programa, args, { stdio: ["ignore", "pipe", "inherit"] });
  tar.stdout.setEncoding("latin1");
  const linhas = readline.createInterface({ input: tar.stdout, crlfDelay: Infinity });
  for await (const linha of linhas) aoLer(linha);
  await new Promise((resolve, reject) => tar.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`tar saiu com ${c}`)))));
}

/** O cadastro guarda muito celular no formato antigo, com 8 dígitos começando por 6 a 9: falta o 9 na frente. Fixo começa por 2 a 5. */
const acertarNumero = (n) => (n.length === 8 && /^[6-9]/.test(n) ? `9${n}` : n);

const campos = (linha) => linha.slice(1, -1).split('";"');
const digitos = (s) => (s ?? "").replace(/\D/g, "");
const titulo = (s) =>
  (s ?? "")
    .toLowerCase()
    .replace(/(^|[\s/\-.(])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

/* ------------------------------------------------------------ 1. tabelas pequenas ---- */

const municipios = new Map();
{
  const zip = await baixar("Municipios.zip");
  await lerZip(zip, (l) => {
    const [codigo, nome] = campos(l);
    municipios.set(codigo, nome);
  });
  fs.rmSync(zip);
  log(`municípios: ${municipios.size}`);
}

/* ---------------------------------------------------- 2. estabelecimentos (filtro) ---- */

// O menor primeiro, para conferir as colunas cedo; o Estabelecimentos0 (2,3 GB) fica por último.
const ORDEM = [9, 1, 2, 3, 4, 5, 6, 7, 8, 0];
const achadas = new Map(); // cnpj básico -> registro
for (const n of ORDEM) {
  const nome = `Estabelecimentos${n}.zip`;
  log(`baixando ${nome}`);
  const zip = await baixar(nome);
  let lidas = 0;
  await lerZip(zip, (l) => {
    lidas++;
    if (!l.includes('"4511102"') && !l.includes('"4511101"')) return;
    const p = campos(l);
    // 3 matriz/filial, 5 situação (02 = ativa), 11 CNAE principal, 19 UF
    if (p[3] !== "1" || p[5] !== "02" || !UFS.has(p[19]) || !CNAES[p[11]]) return;
    const ddd1 = digitos(p[21]);
    const tel1 = digitos(p[22]);
    const ddd2 = digitos(p[23]);
    const tel2 = digitos(p[24]);
    // O e-mail do cadastro muitas vezes é do escritório de contabilidade, e abordar o contador não leva à revenda: descarta.
    const bruto = (p[27] ?? "").trim().toLowerCase();
    const email = EMAIL_DE_CONTADOR.test(bruto) ? "" : bruto;
    const telefones = [ddd1 && tel1 ? { ddd: ddd1, numero: acertarNumero(tel1) } : null, ddd2 && tel2 ? { ddd: ddd2, numero: acertarNumero(tel2) } : null]
      .filter(Boolean)
      .filter((t, i, todos) => todos.findIndex((o) => o.ddd === t.ddd && o.numero === t.numero) === i);
    if (!telefones.length && !email.includes("@")) return;
    achadas.set(p[0], {
      basico: p[0],
      cnpj: `${p[0]}${p[1]}${p[2]}`,
      fantasia: p[4],
      inicio: p[10],
      cnae: p[11],
      uf: p[19],
      cidade: municipios.get(p[20]) ?? "",
      telefones,
      email: email.includes("@") ? email : "",
    });
  });
  fs.rmSync(zip);
  log(`${nome}: ${lidas.toLocaleString("pt-BR")} linhas lidas, ${achadas.size} revendas até agora`);
}

/* ---------------------------------------------------- 3. razão social e porte ---- */

const empresas = new Map();
for (const n of ORDEM) {
  const nome = `Empresas${n}.zip`;
  log(`baixando ${nome}`);
  const zip = await baixar(nome);
  await lerZip(zip, (l) => {
    const basico = l.slice(1, 9);
    if (!achadas.has(basico)) return;
    const p = campos(l);
    empresas.set(basico, { razao: p[1], capital: Number(String(p[4]).replace(/\./g, "").replace(",", ".")) || 0, porte: p[5] });
  });
  fs.rmSync(zip);
  log(`${nome}: ${empresas.size} de ${achadas.size} com razão social`);
}

/* ----------------------------------------------------------- 4. pontuar e gravar ---- */

const PORTE = { "01": "ME", "03": "EPP" }; // "05" (demais) fica em branco: o importador do SDR não tem esse porte
const ehCelular = (t) => t.numero.length === 9 && t.numero.startsWith("9");
const formatar = (t) => (t.numero.length === 9 ? `(${t.ddd}) ${t.numero.slice(0, 5)}-${t.numero.slice(5)}` : `(${t.ddd}) ${t.numero.slice(0, 4)}-${t.numero.slice(4)}`);
const anoAtual = Number(MES.slice(0, 4));

const linhas = [...achadas.values()].map((r) => {
  const emp = empresas.get(r.basico) ?? { razao: "", capital: 0, porte: "" };
  const tels = [...r.telefones].sort((a, b) => Number(ehCelular(b)) - Number(ehCelular(a)));
  const celular = tels.some(ehCelular);
  const aberta = Number(String(r.inicio).slice(0, 4)) || anoAtual;
  const pontos = (r.cnae === "4511102" ? 100 : 0) + (celular ? 20 : 0) + (r.email ? 10 : 0) + (emp.porte === "05" ? 6 : emp.porte === "03" ? 4 : 0) + (emp.capital >= 100_000 ? 3 : 0) + (anoAtual - aberta >= 3 ? 2 : 0);
  return { ...r, razao: emp.razao, porte: PORTE[emp.porte] ?? "", tels, celular, pontos };
});
linhas.sort((a, b) => b.pontos - a.pontos || a.cnpj.localeCompare(b.cnpj));

const celula = (v) => {
  const t = String(v ?? "");
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const CABECALHO = ["CNPJ", "Razão Social", "Nome Fantasia", "Telefone", "E-mail", "Site", "Instagram", "UF", "Cidade", "Segmento", "Porte", "CNAE"];
const paraCsv = (r) =>
  [r.cnpj, titulo(r.razao), titulo(r.fantasia), r.tels.map(formatar).join(" / "), r.email, "", "", r.uf, titulo(r.cidade), CNAES[r.cnae], r.porte, r.cnae].map(celula).join(";");

let arquivos = 0;
for (let i = 0; i < linhas.length; i += LINHAS_POR_ARQUIVO) {
  arquivos++;
  const nome = `revendas-${String(arquivos).padStart(2, "0")}.csv`;
  fs.writeFileSync(path.join(pastaDeSaida, nome), [CABECALHO.join(";"), ...linhas.slice(i, i + LINHAS_POR_ARQUIVO).map(paraCsv)].join("\n") + "\n", "utf8");
}

const conta = (f) => linhas.filter(f).length;
const resumo = {
  geradoEm: new Date().toISOString(),
  fonte: `Receita Federal, dados abertos do CNPJ, ${MES}`,
  ufs: [...UFS],
  total: linhas.length,
  usados: conta((r) => r.cnae === "4511102"),
  novos: conta((r) => r.cnae === "4511101"),
  porUf: Object.fromEntries([...UFS].map((u) => [u, conta((r) => r.uf === u)])),
  comCelular: conta((r) => r.celular),
  comEmail: conta((r) => !!r.email),
  semRazaoSocial: conta((r) => !r.razao),
  arquivos,
  linhasPorArquivo: LINHAS_POR_ARQUIVO,
};
fs.writeFileSync(path.join(pastaDeSaida, "resumo.json"), JSON.stringify(resumo, null, 2));
log(`pronto: ${JSON.stringify(resumo)}`);
