/**
 * Uso (na raiz do repositório):
 *   npm run verificar:tenant                       só o que é novo desde a linha de base
 *   npm run verificar:tenant -- --tudo             também mostra o que já estava na linha de base
 *   npm run verificar:tenant -- --arquivo caminho  analisa só um arquivo (repetível)
 *   npm run verificar:tenant -- --json             saída para máquina
 *   npm run verificar:tenant -- --estrito          avisos novos também reprovam
 *   npm run verificar:tenant -- --atualizar-baseline   regrava a linha de base (revisar o diff!)
 *
 * Só lê arquivos. Não abre conexão com banco e não precisa de .env.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { analisarArquivo, type Achado } from "./analisador";
import { lerModelos } from "./modelos";

// Defesa extra: mesmo que alguém coloque um .env na frente, esta ferramenta
// nunca recebe endereço de banco.
for (const chave of Object.keys(process.env)) {
  if (/^(DATABASE|DIRECT|POSTGRES|PG|NEON|DB)[A-Z_]*(URL|URI|HOST)?$/i.test(chave) || /DATABASE_URL|DIRECT_URL/i.test(chave)) delete process.env[chave];
}

const PASTAS_IGNORADAS = new Set(["node_modules", ".next", "dist", "build", ".turbo", "coverage", ".git", "scripts"]);

function acharRaiz(): string {
  let atual = resolve(process.cwd());
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(atual, "packages/db/prisma/schema.prisma"))) return atual;
    atual = resolve(atual, "..");
  }
  throw new Error("Não achei a raiz do repositório (packages/db/prisma/schema.prisma). Rode na raiz: npm run verificar:tenant");
}

function listar(dir: string, acumulado: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (PASTAS_IGNORADAS.has(nome)) continue;
    const caminho = join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) listar(caminho, acumulado);
    else if (/\.(ts|tsx)$/.test(nome) && !/\.d\.ts$/.test(nome) && !/\.test(-manual)?\.tsx?$/.test(nome)) acumulado.push(caminho);
  }
  return acumulado;
}

interface ItemDaBase {
  regra: string;
  gravidade: string;
  arquivo: string;
  modelo?: string;
  operacao?: string;
}
interface Base {
  versao: 1;
  itens: Record<string, ItemDaBase>;
}

function main() {
  const args = process.argv.slice(2);
  const tem = (f: string) => args.includes(f);
  const arquivosPedidos = args.flatMap((a, i) => (a === "--arquivo" && args[i + 1] ? [args[i + 1]] : []));

  const raiz = acharRaiz();
  const modelos = lerModelos(readFileSync(join(raiz, "packages/db/prisma/schema.prisma"), "utf8"));
  const caminhoBase = join(raiz, "scripts/verificar-tenant/baseline.json");

  const candidatos = arquivosPedidos.length
    ? arquivosPedidos.map((a) => resolve(raiz, a))
    : [...listar(join(raiz, "apps")), ...listar(join(raiz, "packages"))];

  const achados: Achado[] = [];
  let analisados = 0;
  for (const caminho of candidatos) {
    const rel = relative(raiz, caminho).split("\\").join("/");
    // Só o código que usa o banco do Zap. Ponto, Esquadrias e ERP têm outro schema e outra chave (empresaId).
    if (rel.startsWith("packages/db/") || rel.startsWith("packages/erp-db/") || rel.startsWith("packages/ponto-db/")) continue;
    const texto = readFileSync(caminho, "utf8");
    if (!texto.includes("@dilon-zap/db")) continue;
    analisados++;
    achados.push(...analisarArquivo({ arquivo: rel, texto, modelos }));
  }

  if (tem("--atualizar-baseline")) {
    const base: Base = { versao: 1, itens: {} };
    for (const a of achados.filter((x) => x.gravidade !== "INFO").sort((x, y) => x.impressao.localeCompare(y.impressao))) {
      base.itens[a.impressao] = { regra: a.regra, gravidade: a.gravidade, arquivo: a.arquivo, modelo: a.modelo, operacao: a.operacao };
    }
    writeFileSync(caminhoBase, JSON.stringify(base, null, 2) + "\n");
    console.log(`Linha de base regravada: ${Object.keys(base.itens).length} itens em scripts/verificar-tenant/baseline.json.`);
    console.log("ATENÇÃO: revise o diff com o Tech Lead. Aceitar item novo na linha de base é aceitar um risco conhecido.");
    return 0;
  }

  const base: Base = existsSync(caminhoBase) && !tem("--sem-baseline") ? JSON.parse(readFileSync(caminhoBase, "utf8")) : { versao: 1, itens: {} };
  const novos = achados.filter((a) => a.gravidade !== "INFO" && !base.itens[a.impressao]);
  const conhecidos = achados.filter((a) => a.gravidade !== "INFO" && base.itens[a.impressao]);
  const infos = achados.filter((a) => a.gravidade === "INFO");
  const presentes = new Set(achados.map((a) => a.impressao));
  const resolvidos = arquivosPedidos.length ? [] : Object.keys(base.itens).filter((k) => !presentes.has(k));

  const novosErros = novos.filter((a) => a.gravidade === "ERRO");
  const novosAvisos = novos.filter((a) => a.gravidade === "AVISO");
  const reprovou = novosErros.length > 0 || (tem("--estrito") && novosAvisos.length > 0);

  if (tem("--json")) {
    console.log(JSON.stringify({ analisados, novos, conhecidos: conhecidos.length, resolvidos: resolvidos.length, aprovado: !reprovou }, null, 2));
    return reprovou ? 1 : 0;
  }

  const rotulo = (a: Achado) => `${a.gravidade.padEnd(5)} ${a.regra}${a.prioridade === "ALTA" ? " [ALTA]" : ""}  ${a.arquivo}:${a.linha}\n         ${a.mensagem}`;
  console.log(`Verificação de isolamento entre empresas (somente leitura, sem banco)`);
  console.log(`Arquivos que usam o banco do Zap analisados: ${analisados}\n`);

  if (novos.length) {
    console.log(`NOVOS (não estavam na linha de base): ${novosErros.length} erro(s), ${novosAvisos.length} aviso(s)`);
    for (const a of novos.sort((x, y) => (x.gravidade === y.gravidade ? x.arquivo.localeCompare(y.arquivo) : x.gravidade === "ERRO" ? -1 : 1))) console.log(rotulo(a));
    console.log("");
  }
  if (tem("--tudo")) {
    console.log(`JÁ CONHECIDOS (linha de base): ${conhecidos.length}`);
    for (const a of conhecidos) console.log(rotulo(a));
    console.log("");
    if (infos.length) {
      console.log(`INFORMATIVOS (áreas de administração, acesso entre empresas permitido a SUPERADMIN): ${infos.length}`);
      for (const a of infos) console.log(rotulo(a));
      console.log("");
    }
  }

  const altas = conhecidos.filter((a) => a.prioridade === "ALTA").length;
  const porRegra = new Map<string, number>();
  for (const a of conhecidos) porRegra.set(a.regra, (porRegra.get(a.regra) ?? 0) + 1);
  console.log(`Já conhecidos e aceitos: ${conhecidos.length} (${[...porRegra].sort().map(([r, n]) => `${r}: ${n}`).join(", ") || "nenhum"}), dos quais ${altas} de prioridade ALTA (rotas que o usuário acessa direto). Veja todos com --tudo.`);
  if (resolvidos.length) console.log(`Corrigidos desde a última linha de base: ${resolvidos.length}. Rode com --atualizar-baseline para registrar a melhora.`);
  console.log("");
  console.log(reprovou ? "RESULTADO: REPROVADO. Corrija os erros novos acima, ou, se for de propósito, marque com `// verificar-tenant: ok — motivo` e explique na revisão." : "RESULTADO: APROVADO (nenhum erro novo).");
  return reprovou ? 1 : 0;
}

// process.exitCode (e não process.exit) para a saída longa terminar de ser escrita.
try {
  process.exitCode = main();
} catch (e) {
  console.error(`Falha ao executar a verificação: ${(e as Error).message}`);
  process.exitCode = 2;
}
