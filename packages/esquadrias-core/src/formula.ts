/**
 * Avaliador de fórmulas das tipologias.
 *
 * Toda a customização do sistema passa por aqui: o corte de um perfil não é
 * um número no código, é `L - 2 * folga` escrito pela própria serralheria na
 * tela de tipologias. Cada empresa monta a esquadria do jeito dela (linha de
 * perfil diferente, folga diferente, encaixe diferente), então a regra tem
 * que ser DADO no banco, não código nosso.
 *
 * Por isso este arquivo é um parser de verdade e não `new Function(expr)`:
 * a expressão vem do banco, escrita por um usuário, e é avaliada no servidor
 * ao gerar orçamento. Com `eval`/`Function`, qualquer cliente do SaaS
 * escreveria `process.env` numa fórmula e leria o segredo de outro tenant.
 * O custo de escrever o parser é pago uma vez; o de um `eval` é pago quando
 * for tarde demais.
 */

export class ErroDeFormula extends Error {
  constructor(mensagem: string, readonly expressao: string) {
    super(mensagem);
    this.name = "ErroDeFormula";
  }
}

type Token =
  | { tipo: "num"; valor: number }
  | { tipo: "id"; valor: string }
  | { tipo: "op"; valor: string }
  | { tipo: "("; }
  | { tipo: ")"; }
  | { tipo: ","; };

const OPERADORES_2CH = ["<=", ">=", "==", "!=", "<>"];
const OPERADORES_1CH = "+-*/%^<>=";

function tokenizar(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const c = expr[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    if (c >= "0" && c <= "9") {
      let j = i;
      let jaTemSeparador = false;
      while (j < expr.length) {
        const d = expr[j];
        if (d >= "0" && d <= "9") { j++; continue; }
        // Vírgula decimal é aceita porque quem escreve a fórmula digita "0,5"
        // — é o separador do teclado brasileiro. Só que a vírgula também
        // separa argumentos em `arred(L / 3, 2)`: por isso ela só entra no
        // número quando está entre dígitos. Sem essa checagem, `se(H, 2, 1)`
        // vira `se(H, 2)` silenciosamente e a fórmula do cliente muda de
        // sentido sem erro nenhum.
        const proximo = expr[j + 1];
        const ehSeparadorDecimal = (d === "." || d === ",") && !jaTemSeparador && proximo >= "0" && proximo <= "9";
        if (!ehSeparadorDecimal) break;
        jaTemSeparador = true;
        j++;
      }
      const bruto = expr.slice(i, j).replace(",", ".");
      const valor = Number(bruto);
      if (!Number.isFinite(valor)) throw new ErroDeFormula(`número inválido: "${bruto}"`, expr);
      tokens.push({ tipo: "num", valor });
      i = j;
      continue;
    }

    if (/[A-Za-z_ÀÁÂÃÉÊÍÓÔÕÚÇàáâãéêíóôõúç]/.test(c)) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_ÀÁÂÃÉÊÍÓÔÕÚÇàáâãéêíóôõúç]/.test(expr[j])) j++;
      tokens.push({ tipo: "id", valor: expr.slice(i, j) });
      i = j;
      continue;
    }

    if (c === "(") { tokens.push({ tipo: "(" }); i++; continue; }
    if (c === ")") { tokens.push({ tipo: ")" }); i++; continue; }
    if (c === ",") { tokens.push({ tipo: "," }); i++; continue; }

    const dois = expr.slice(i, i + 2);
    if (OPERADORES_2CH.includes(dois)) {
      tokens.push({ tipo: "op", valor: dois === "<>" ? "!=" : dois });
      i += 2;
      continue;
    }

    if (OPERADORES_1CH.includes(c)) {
      tokens.push({ tipo: "op", valor: c === "=" ? "==" : c });
      i++;
      continue;
    }

    throw new ErroDeFormula(`caractere inesperado: "${c}"`, expr);
  }

  return tokens;
}

type Funcao = { aridade: number | [number, number]; calcular: (args: number[]) => number };

/**
 * Nomes em português porque quem escreve a fórmula é o dono da serralheria,
 * não um programador. `teto(L / 600)` é lido; `Math.ceil` não.
 */
const FUNCOES: Record<string, Funcao> = {
  min: { aridade: [1, 16], calcular: (a) => Math.min(...a) },
  max: { aridade: [1, 16], calcular: (a) => Math.max(...a) },
  abs: { aridade: 1, calcular: ([a]) => Math.abs(a) },
  teto: { aridade: 1, calcular: ([a]) => Math.ceil(a) },
  piso: { aridade: 1, calcular: ([a]) => Math.floor(a) },
  raiz: { aridade: 1, calcular: ([a]) => Math.sqrt(a) },
  arred: {
    aridade: [1, 2],
    calcular: ([a, casas]) => {
      const f = Math.pow(10, casas ?? 0);
      return Math.round(a * f) / f;
    },
  },
  // `se(cond, entao, senao)` avalia os dois ramos antes de escolher. É o
  // aceitável aqui: fórmula não tem efeito colateral nem recursão, então
  // avaliar o ramo perdedor só custa aritmética.
  se: { aridade: 3, calcular: ([cond, entao, senao]) => (cond !== 0 ? entao : senao) },
};

export const FUNCOES_DISPONIVEIS = Object.keys(FUNCOES);

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[], private readonly escopo: Record<string, number>, private readonly expr: string) {}

  private atual(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consumirOp(valores: string[]): string | null {
    const t = this.atual();
    if (t && t.tipo === "op" && valores.includes(t.valor)) {
      this.pos++;
      return t.valor;
    }
    return null;
  }

  avaliar(): number {
    const v = this.comparacao();
    if (this.pos < this.tokens.length) throw new ErroDeFormula("sobrou conteúdo no fim da expressão", this.expr);
    return v;
  }

  // Comparação devolve 1 ou 0 — é o que alimenta o `se(...)`.
  private comparacao(): number {
    let esq = this.soma();
    let op: string | null;
    while ((op = this.consumirOp(["<", ">", "<=", ">=", "==", "!="]))) {
      const dir = this.soma();
      const r =
        op === "<" ? esq < dir :
        op === ">" ? esq > dir :
        op === "<=" ? esq <= dir :
        op === ">=" ? esq >= dir :
        op === "==" ? Math.abs(esq - dir) < 1e-9 :
        Math.abs(esq - dir) >= 1e-9;
      esq = r ? 1 : 0;
    }
    return esq;
  }

  private soma(): number {
    let esq = this.produto();
    let op: string | null;
    while ((op = this.consumirOp(["+", "-"]))) {
      const dir = this.produto();
      esq = op === "+" ? esq + dir : esq - dir;
    }
    return esq;
  }

  private produto(): number {
    let esq = this.unario();
    let op: string | null;
    while ((op = this.consumirOp(["*", "/", "%"]))) {
      const dir = this.unario();
      if ((op === "/" || op === "%") && dir === 0) throw new ErroDeFormula("divisão por zero", this.expr);
      esq = op === "*" ? esq * dir : op === "/" ? esq / dir : esq % dir;
    }
    return esq;
  }

  private unario(): number {
    const op = this.consumirOp(["-", "+"]);
    if (op === "-") return -this.unario();
    if (op === "+") return this.unario();
    return this.potencia();
  }

  private potencia(): number {
    const base = this.primario();
    if (this.consumirOp(["^"])) {
      // Associatividade à direita: 2^3^2 é 2^9, como em qualquer calculadora.
      const exp = this.unario();
      return Math.pow(base, exp);
    }
    return base;
  }

  private primario(): number {
    const t = this.atual();
    if (!t) throw new ErroDeFormula("expressão incompleta", this.expr);

    if (t.tipo === "num") {
      this.pos++;
      return t.valor;
    }

    if (t.tipo === "(") {
      this.pos++;
      const v = this.comparacao();
      if (this.atual()?.tipo !== ")") throw new ErroDeFormula("faltou fechar parêntese", this.expr);
      this.pos++;
      return v;
    }

    if (t.tipo === "id") {
      this.pos++;
      const nome = t.valor;

      if (this.atual()?.tipo === "(") {
        this.pos++;
        const args: number[] = [];
        if (this.atual()?.tipo !== ")") {
          args.push(this.comparacao());
          while (this.atual()?.tipo === ",") {
            this.pos++;
            args.push(this.comparacao());
          }
        }
        if (this.atual()?.tipo !== ")") throw new ErroDeFormula(`faltou fechar parêntese em ${nome}(...)`, this.expr);
        this.pos++;

        const fn = FUNCOES[nome.toLowerCase()];
        if (!fn) throw new ErroDeFormula(`função desconhecida: "${nome}"`, this.expr);
        const [minA, maxA] = Array.isArray(fn.aridade) ? fn.aridade : [fn.aridade, fn.aridade];
        if (args.length < minA || args.length > maxA) {
          throw new ErroDeFormula(`${nome}() espera ${minA === maxA ? minA : `${minA} a ${maxA}`} argumento(s), recebeu ${args.length}`, this.expr);
        }
        return fn.calcular(args);
      }

      const valor = this.escopo[nome] ?? this.escopo[nome.toUpperCase()] ?? this.escopo[nome.toLowerCase()];
      if (valor === undefined) throw new ErroDeFormula(`variável não definida: "${nome}"`, this.expr);
      if (!Number.isFinite(valor)) throw new ErroDeFormula(`variável "${nome}" não é um número`, this.expr);
      return valor;
    }

    throw new ErroDeFormula("token inesperado", this.expr);
  }
}

/** Avalia a expressão no escopo dado. Lança `ErroDeFormula` se a fórmula for inválida. */
export function avaliarFormula(expressao: string, escopo: Record<string, number>): number {
  const expr = (expressao ?? "").trim();
  if (!expr) throw new ErroDeFormula("fórmula vazia", expressao ?? "");

  const resultado = new Parser(tokenizar(expr), escopo, expr).avaliar();
  if (!Number.isFinite(resultado)) throw new ErroDeFormula("resultado não é um número finito", expr);
  return resultado;
}

/**
 * Valida a fórmula sem depender de medidas reais: roda com um escopo de teste.
 * A tela de tipologias usa isso pra dizer "fórmula inválida" na hora de salvar,
 * e não seis meses depois no meio de um orçamento do cliente.
 */
export function validarFormula(expressao: string, variaveis: string[]): { ok: true } | { ok: false; erro: string } {
  const escopo: Record<string, number> = {};
  for (const v of variaveis) escopo[v] = 1000;
  try {
    avaliarFormula(expressao, escopo);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "fórmula inválida" };
  }
}
