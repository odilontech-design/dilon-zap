/**
 * Verificação estática de isolamento entre empresas (tenants) no Dilon Zap.
 *
 * NÃO conecta ao banco, NÃO importa o cliente Prisma, NÃO executa o código
 * analisado: só lê texto e monta a árvore sintática com o compilador do
 * TypeScript. Por isso não há como alterar dado nenhum, nem em produção.
 *
 * O que procura (ver docs/verificacao-tenant.md):
 *   R1  leitura de modelo com tenantId sem filtrar por tenantId
 *   R2  update/delete/upsert (inclusive updateMany/deleteMany) sem tenantId no where
 *   R3  create/createMany sem tenantId nos dados
 *   R4  tenantId vindo do pedido (body, params, query), não da sessão
 *   R5  SQL cru (`$queryRawUnsafe` é erro; `$queryRaw` sem tenantId é aviso)
 *   R6  rota de API sem nenhuma checagem de acesso reconhecível
 *   R7  campo secreto (hash de senha, credencial do WhatsApp) selecionado
 *   R8  isenção `verificar-tenant: ok` sem motivo
 *   R9  update/delete/find só por `id` em modelo SEM tenantId próprio
 */
import ts from "typescript";
import { createHash } from "node:crypto";
import type { Modelo } from "./modelos";

export type Gravidade = "ERRO" | "AVISO" | "INFO";
export type CodigoRegra = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9";

export interface Achado {
  regra: CodigoRegra;
  gravidade: Gravidade;
  /** ALTA = rota que o usuário acessa direto (apps/web/app/api); o resto é interno. */
  prioridade?: "ALTA" | "MEDIA";
  arquivo: string;
  linha: number;
  modelo?: string;
  operacao?: string;
  mensagem: string;
  /** Identificador estável (não depende do número da linha), usado na linha de base. */
  impressao: string;
}

const LEITURAS = new Set(["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate", "groupBy"]);
const ESCRITAS_POR_FILTRO = new Set(["update", "updateMany", "delete", "deleteMany", "upsert"]);
const CRIACOES = new Set(["create", "createMany", "createManyAndReturn"]);
const TODAS = new Set([...LEITURAS, ...ESCRITAS_POR_FILTRO, ...CRIACOES]);

/** Palavras que indicam dado vindo do navegador. `params` e `req` só valem dentro das rotas do Next (em função do worker são parâmetros comuns). */
const PEDIDO_NAS_ROTAS = /\b(body|params|searchParams|query|req|request|payload|formData|parsed)\b/;
const PEDIDO_EM_QUALQUER_LUGAR = /\b(body|searchParams|formData)\b/;
const DA_SESSAO = /^\s*(user|session|ctx|usuario|sessao)\b/;
const ISENCAO = /verificar-tenant:\s*ok(?:\s*[—–:-]+\s*(.*))?/i;
const ACESSO = /\b(requireUser|requireOwner|requireSuperAdmin|requireGerencia|requireFinanceiro|getServerSession|getToken|CRON_SECRET|timingSafeEqual|verificarApiKey|autenticarApiKey|WEBHOOK|x-hub-signature|assinatura)\b/i;
const SECRETOS = /\b(passwordHash|authCreds|signalKeys)\s*:\s*true/;

function veioDoPedido(valor: string, arquivo: string): boolean {
  const regra = arquivo.startsWith("apps/web/app/") ? PEDIDO_NAS_ROTAS : PEDIDO_EM_QUALQUER_LUGAR;
  return regra.test(valor);
}

function impressao(arquivo: string, regra: string, alvo: string, trecho: string): string {
  const norm = trecho.replace(/\s+/g, " ").slice(0, 240);
  return `${arquivo}::${regra}::${alvo}::${createHash("sha1").update(norm).digest("hex").slice(0, 10)}`;
}

interface ResultadoChave {
  tem: boolean;
  /** `...spread` presente: pode carregar o tenantId, não dá para saber. */
  spread: boolean;
}

/** `tenantId` (ou `tenant`) como chave de nível superior, inclusive dentro de AND. */
function procurarTenant(obj: ts.ObjectLiteralExpression, profundidade = 0): ResultadoChave {
  const r: ResultadoChave = { tem: false, spread: false };
  for (const p of obj.properties) {
    if (ts.isSpreadAssignment(p)) {
      r.spread = true;
      continue;
    }
    const nome = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : "";
    if (nome === "tenantId" || nome === "tenant") r.tem = true;
    // Filtro por relação: where: { conversation: { tenantId } } também escopa pela empresa.
    if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer) && nome !== "AND" && nome !== "OR" && nome !== "NOT" && profundidade < 3) {
      const sub = procurarTenant(p.initializer, profundidade + 1);
      r.tem ||= sub.tem;
    }
    if (nome === "AND" && ts.isPropertyAssignment(p)) {
      const v = p.initializer;
      const itens = ts.isArrayLiteralExpression(v) ? v.elements : [v];
      for (const el of itens) {
        if (ts.isObjectLiteralExpression(el)) {
          const sub = procurarTenant(el, profundidade);
          r.tem ||= sub.tem;
          r.spread ||= sub.spread;
        }
      }
    }
  }
  return r;
}

function propriedade(obj: ts.ObjectLiteralExpression, nome: string): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === nome) return p.initializer;
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === nome) return p.name;
  }
  return undefined;
}

function chavesDoWhere(obj: ts.ObjectLiteralExpression): string[] {
  const chaves: string[] = [];
  for (const p of obj.properties) {
    if (ts.isSpreadAssignment(p)) chaves.push("...");
    else if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) chaves.push(p.name.text);
  }
  return chaves;
}

/** Texto do valor de uma chave do where (ex.: o `contact.id` de `{ id: contact.id }`). */
function valorDaChave(obj: ts.ObjectLiteralExpression, chave: string, fonte: ts.SourceFile): string | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === chave) return p.initializer.getText(fonte);
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === chave) return p.name.text;
  }
  return undefined;
}

/**
 * O where só tem valores "herdados": literais, dados da sessão ou campos de um
 * registro já carregado (`contato.id`). Nesse caso o filtro de empresa é o da
 * consulta que carregou o registro (que é verificada à parte).
 */
function classificarWhere(obj: ts.ObjectLiteralExpression, fonte: ts.SourceFile, arquivo: string): "sim" | "literal" | "nao" {
  let algum = false;
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p)) return "nao";
    const v = p.initializer;
    if (ts.isStringLiteralLike(v) || ts.isNumericLiteral(v) || v.kind === ts.SyntaxKind.TrueKeyword || v.kind === ts.SyntaxKind.FalseKeyword || v.kind === ts.SyntaxKind.NullKeyword || ts.isArrayLiteralExpression(v)) continue;
    if (ts.isObjectLiteralExpression(v)) {
      // Chave composta (contactId_sessionId: { ... }) ou operador ({ not: "X" }).
      const sub = classificarWhere(v, fonte, arquivo);
      if (sub === "nao") return "nao";
      if (sub === "sim") algum = true;
      continue;
    }
    if (ts.isPropertyAccessExpression(v) || ts.isNonNullExpression(v)) {
      const texto = v.getText(fonte);
      if (veioDoPedido(texto, arquivo)) return "nao";
      if (/^[A-Za-z_$][\w$]*(\?)?\./.test(texto)) {
        algum = true;
        continue;
      }
    }
    return "nao";
  }
  return algum ? "sim" : "literal";
}

function whereHerdado(obj: ts.ObjectLiteralExpression, fonte: ts.SourceFile, arquivo: string): boolean {
  return classificarWhere(obj, fonte, arquivo) === "sim";
}

function valorDoTenantNoWhere(obj: ts.ObjectLiteralExpression, fonte: ts.SourceFile): string | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "tenantId") return p.initializer.getText(fonte);
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "AND") {
      const v = p.initializer;
      for (const el of ts.isArrayLiteralExpression(v) ? v.elements : [v]) {
        if (ts.isObjectLiteralExpression(el)) {
          const achou = valorDoTenantNoWhere(el, fonte);
          if (achou) return achou;
        }
      }
    }
  }
  return undefined;
}

function motivoDaIsencao(texto: string, linhaDaChamada: number): { existe: boolean; motivo: string } {
  const linhas = texto.split("\n");
  for (let i = linhaDaChamada; i >= Math.max(0, linhaDaChamada - 3); i--) {
    const m = ISENCAO.exec(linhas[i] ?? "");
    if (m) return { existe: true, motivo: (m[1] ?? "").trim() };
  }
  return { existe: false, motivo: "" };
}

export interface OpcoesDeArquivo {
  /** Caminho relativo à raiz do repositório, com barras normais. */
  arquivo: string;
  texto: string;
  modelos: Map<string, Modelo>;
}

export function analisarArquivo({ arquivo, texto, modelos }: OpcoesDeArquivo): Achado[] {
  const achados: Achado[] = [];
  const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, arquivo.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const ehAdmin = /\/(api\/)?admin\//.test(arquivo) || /\brequireSuperAdmin\b/.test(texto);
  const vistos = new Map<string, number>();

  function registrar(a: Omit<Achado, "arquivo" | "impressao">, trecho: string) {
    let imp = impressao(arquivo, a.regra, `${a.modelo ?? ""}.${a.operacao ?? ""}`, trecho);
    const n = (vistos.get(imp) ?? 0) + 1;
    vistos.set(imp, n);
    if (n > 1) imp += `#${n}`;
    achados.push({ ...a, arquivo, impressao: imp });
  }

  function linhaDe(no: ts.Node): number {
    return fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line;
  }

  function funcaoEnvolvente(no: ts.Node): ts.Node {
    let atual: ts.Node | undefined = no.parent;
    while (atual && !ts.isFunctionDeclaration(atual) && !ts.isArrowFunction(atual) && !ts.isFunctionExpression(atual) && !ts.isMethodDeclaration(atual)) atual = atual.parent;
    return atual ?? fonte;
  }

  // Pré-passagem: onde, em cada função, já houve consulta FILTRADA por tenantId em cada modelo.
  const filtradas: Array<{ modelo: string; fim: number; funcao: ts.Node }> = [];
  function coletarFiltradas(no: ts.Node) {
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && TODAS.has(no.expression.name.text) && ts.isPropertyAccessExpression(no.expression.expression)) {
      const m = modelos.get(no.expression.expression.name.text);
      const a0 = no.arguments[0];
      if (m && a0 && ts.isObjectLiteralExpression(a0)) {
        const w = propriedade(a0, "where");
        if (w && ts.isObjectLiteralExpression(w) && procurarTenant(w).tem) filtradas.push({ modelo: m.nome, fim: no.getEnd(), funcao: funcaoEnvolvente(no) });
      }
    }
    ts.forEachChild(no, coletarFiltradas);
  }
  coletarFiltradas(fonte);

  function jaFiltradaAntes(chamada: ts.CallExpression, modelo: string): boolean {
    const f = funcaoEnvolvente(chamada);
    return filtradas.some((x) => x.modelo === modelo && x.funcao === f && x.fim <= chamada.getStart(fonte));
  }

  // $queryRaw`select ...` é um "template etiquetado", não uma chamada comum.
  function tratarTemplateEtiquetado(no: ts.TaggedTemplateExpression) {
    if (!ts.isPropertyAccessExpression(no.tag)) return;
    const op = no.tag.name.text;
    if (!/^\$(query|execute)Raw$/.test(op)) return;
    const trecho = no.getText(fonte);
    const l = linhaDe(no);
    if (motivoDaIsencao(texto, l).existe || ehAdmin || /tenantId|tenant_id/i.test(trecho)) return;
    registrar({ regra: "R5", gravidade: "AVISO", linha: l + 1, operacao: op, mensagem: "SQL cru sem a palavra tenantId: confirme à mão que não atravessa empresas." }, trecho);
  }

  function visitar(no: ts.Node) {
    if (ts.isCallExpression(no)) tratarChamada(no);
    if (ts.isTaggedTemplateExpression(no)) tratarTemplateEtiquetado(no);
    ts.forEachChild(no, visitar);
  }

  function tratarChamada(chamada: ts.CallExpression) {
    const exp = chamada.expression;
    if (!ts.isPropertyAccessExpression(exp)) return;
    const op = exp.name.text;

    // SQL cru: prisma.$queryRaw`...`, $executeRawUnsafe(...)
    if (/^\$(query|execute)Raw(Unsafe)?$/.test(op)) {
      const trecho = chamada.getText(fonte);
      const l = linhaDe(chamada);
      if (motivoDaIsencao(texto, l).existe) return;
      if (op.endsWith("Unsafe")) {
        registrar({ regra: "R5", gravidade: "ERRO", linha: l + 1, operacao: op, mensagem: `${op}: SQL montado como texto aceita injeção e não garante o filtro por empresa. Use consulta parametrizada.` }, trecho);
      } else if (!/tenantId|tenant_id/i.test(trecho) && !ehAdmin) {
        registrar({ regra: "R5", gravidade: "AVISO", linha: l + 1, operacao: op, mensagem: "SQL cru sem a palavra tenantId: confirme à mão que não atravessa empresas." }, trecho);
      }
      return;
    }

    if (!TODAS.has(op)) return;
    const modeloExp = exp.expression;
    if (!ts.isPropertyAccessExpression(modeloExp)) return;
    const modelo = modelos.get(modeloExp.name.text);
    if (!modelo || modelo.nome === "Tenant") return;

    const l = linhaDe(chamada);
    const trecho = chamada.getText(fonte);
    const alvo = `${modelo.nome}.${op}`;
    const isenta = motivoDaIsencao(texto, l);
    if (isenta.existe) {
      if (isenta.motivo.length < 10) {
        registrar({ regra: "R8", gravidade: "ERRO", linha: l + 1, modelo: modelo.nome, operacao: op, mensagem: "Isenção `verificar-tenant: ok` precisa de um motivo com pelo menos 10 letras (ex.: `// verificar-tenant: ok — id vem de consulta já filtrada acima`)." }, trecho);
      }
      return;
    }

    const arg = chamada.arguments[0];
    const obj = arg && ts.isObjectLiteralExpression(arg) ? arg : undefined;
    const ehCriacao = CRIACOES.has(op);

    // ---- modelo SEM tenantId próprio (R9) ----
    if (!modelo.temTenantId) {
      if (ehCriacao) return;
      const where = obj ? propriedade(obj, "where") : undefined;
      if (where && ts.isObjectLiteralExpression(where)) {
        const chaves = chavesDoWhere(where);
        if (chaves.length > 0 && chaves.every((c) => c === "id")) {
          registrar({ regra: "R9", gravidade: "AVISO", linha: l + 1, modelo: modelo.nome, operacao: op, mensagem: `${modelo.nome} não tem tenantId próprio e o where usa só \`id\`: confirme que esse id veio de uma consulta já filtrada pela empresa.` }, trecho);
        }
      }
      return;
    }

    // ---- criação (R3) ----
    if (ehCriacao) {
      const dados = obj ? propriedade(obj, "data") : undefined;
      const elementos: ts.Expression[] = [];
      let dinamico = false;
      if (dados && ts.isObjectLiteralExpression(dados)) elementos.push(dados);
      else if (dados && ts.isArrayLiteralExpression(dados)) elementos.push(...dados.elements);
      else dinamico = true;
      let faltou = false;
      for (const el of elementos) {
        if (!ts.isObjectLiteralExpression(el)) {
          dinamico = true;
          continue;
        }
        const r = procurarTenant(el);
        if (!r.tem) {
          if (r.spread) dinamico = true;
          else faltou = true;
        }
      }
      if (faltou) {
        registrar({ regra: "R3", gravidade: "ERRO", linha: l + 1, modelo: modelo.nome, operacao: op, mensagem: `${alvo} sem tenantId nos dados: o registro nasce sem dono e pode aparecer para outra empresa.` }, trecho);
      } else if (dinamico) {
        registrar({ regra: "R3", gravidade: "AVISO", linha: l + 1, modelo: modelo.nome, operacao: op, mensagem: `${alvo}: dados montados fora do literal (spread ou variável); confirme à mão que levam tenantId.` }, trecho);
      }
      return;
    }

    // ---- leitura e escrita por filtro (R1, R2) ----
    const regra: CodigoRegra = LEITURAS.has(op) ? "R1" : "R2";
    const where = obj ? propriedade(obj, "where") : undefined;
    let achouTenant = false;
    let incerto = false;
    let somenteId = false;

    if (where && ts.isObjectLiteralExpression(where)) {
      const r = procurarTenant(where);
      achouTenant = r.tem;
      incerto = r.spread;
      const chaves = chavesDoWhere(where);
      somenteId = chaves.length > 0 && chaves.every((c) => c === "id");
      const valor = valorDoTenantNoWhere(where, fonte);
      if (valor && veioDoPedido(valor, arquivo) && !DA_SESSAO.test(valor)) {
        registrar({ regra: "R4", gravidade: ehAdmin ? "INFO" : "ERRO", linha: l + 1, modelo: modelo.nome, operacao: op, mensagem: `tenantId vem do pedido (\`${valor}\`). O tenant tem de vir SEMPRE da sessão (requireUser → user.tenantId).` }, trecho);
      }
    } else if (where) {
      incerto = true; // where em variável ou chamada: não dá para ler
    } else if (arg && !obj) {
      incerto = true; // argumento em variável
    }

    if (achouTenant) return;
    const contexto = ehAdmin ? " (arquivo de administração: acesso entre empresas só para SUPERADMIN, confira)" : "";
    if (incerto) {
      registrar({ regra, gravidade: "AVISO", linha: l + 1, modelo: modelo.nome, operacao: op, mensagem: `${alvo}: o filtro não é legível aqui (spread ou variável). Confirme à mão que inclui tenantId.${contexto}` }, trecho);
      return;
    }
    // Quem é o id? Da sessão (user.id) é o próprio usuário; de um registro já carregado (contact.id)
    // herda o filtro da consulta que o carregou (checada à parte); do pedido é o caso perigoso.
    const idTexto = where && ts.isObjectLiteralExpression(where) && somenteId ? valorDaChave(where, "id", fonte) : undefined;
    if (idTexto && /^\s*(user|session|usuario|sessao)\b/.test(idTexto)) return;
    const herdado = where !== undefined && ts.isObjectLiteralExpression(where) && whereHerdado(where, fonte, arquivo);
    const verificadoAntes = jaFiltradaAntes(chamada, modelo.nome);

    let gravidade: Gravidade = "ERRO";
    let nota = "";
    if (ehAdmin) {
      gravidade = "INFO";
    } else if (herdado) {
      gravidade = "AVISO";
      nota = " Os valores do filtro vêm de um registro já carregado: vale o filtro da consulta que o carregou.";
    } else if (verificadoAntes && somenteId) {
      gravidade = "AVISO";
      nota = " Há consulta filtrada por tenantId neste modelo acima, na mesma função: confirme que é o MESMO id (padrão busca-depois-age).";
    }
    const prioridade: "ALTA" | "MEDIA" | undefined =
      gravidade === "ERRO" ? (/^apps\/web\/app\/api\//.test(arquivo) && !/\/api\/(admin|webhooks|cron|loja|auth|cadastro)\//.test(arquivo) ? "ALTA" : "MEDIA") : undefined;
    const porque = somenteId
      ? `${alvo} filtra só por \`id\`: quem souber o id de outra empresa lê ou altera o dado dela.`
      : `${alvo} sem tenantId no where: ${regra === "R1" ? "pode ler dados de outras empresas" : "pode alterar ou apagar dados de outras empresas"}.`;
    registrar({ regra, gravidade, prioridade, linha: l + 1, modelo: modelo.nome, operacao: op, mensagem: porque + nota + contexto }, trecho);
  }

  visitar(fonte);

  // R6: rota de API sem nenhuma checagem de acesso reconhecível.
  if (/\/app\/api\/.+\/route\.ts$/.test(arquivo) && !/\/api\/(webhooks|auth|cron|loja)\//.test(arquivo) && !ACESSO.test(texto)) {
    registrar({ regra: "R6", gravidade: "AVISO", linha: 1, mensagem: "Rota de API sem checagem de acesso reconhecível (requireUser, chave de API, segredo de cron ou assinatura). Confirme que é pública de propósito." }, arquivo);
  }

  // R7: campos secretos selecionados.
  if (/\/app\/api\//.test(arquivo)) {
    const linhas = texto.split("\n");
    linhas.forEach((ln, i) => {
      if (SECRETOS.test(ln) && !ISENCAO.test(ln) && !ISENCAO.test(linhas[i - 1] ?? "")) {
        registrar({ regra: "R7", gravidade: "AVISO", linha: i + 1, mensagem: "Campo secreto selecionado em rota de API: confirme que não sai na resposta." }, ln);
      }
    });
  }

  return achados;
}
