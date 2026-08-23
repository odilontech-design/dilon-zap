import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/erp-db";

/**
 * Diagnóstico de instalação.
 *
 * Existe porque a falha de configuração mais comum — uma variável de ambiente
 * em branco — chega ao usuário como "Application error: a server-side
 * exception has occurred. Digest: 491944455". Esse texto não diz o que
 * quebrou, e o log que diria fica noutra tela do provedor, atrás de cliques
 * que quem sobe o sistema pela primeira vez não conhece.
 *
 * NÃO exige autenticação, de propósito: quando falta NEXTAUTH_SECRET é o
 * próprio login que quebra, e um diagnóstico que só responde a quem conseguiu
 * entrar seria inútil justamente na hora em que é necessário.
 *
 * Por isso mesmo, nunca devolve VALOR de variável — só se está presente. O
 * nome de uma configuração é informação inócua; o valor é a senha do banco.
 */
export const dynamic = "force-dynamic";

const OBRIGATORIAS = ["ESQUADRIAS_DATABASE_URL", "NEXTAUTH_SECRET"] as const;
const OPCIONAIS = ["ESQUADRIAS_DIRECT_URL", "NEXTAUTH_URL"] as const;

function estado(nome: string): "ok" | "vazia" | "ausente" {
  const valor = process.env[nome];
  if (valor === undefined) return "ausente";
  // Vazia é diferente de ausente de propósito: criar a variável no painel e
  // deixar o campo em branco é o erro real que motivou esta rota, e as duas
  // situações pedem conselhos diferentes.
  return valor.trim() === "" ? "vazia" : "ok";
}

/**
 * Reduz a exceção a um texto seguro de mostrar.
 *
 * O motivo real da falha de conexão (TLS recusado, autenticação, servidor
 * inalcançável) só existe dentro da mensagem — o client não expõe código. Sem
 * isso o diagnóstico empaca em "não respondeu", que não distingue senha
 * errada de parâmetro que o driver não suporta.
 *
 * A mensagem do Prisma inclui um trecho do CÓDIGO-FONTE, e nele a connection
 * string aparece inteira. Por isso a limpeza é feita em duas passadas — a URL
 * completa e, por garantia, qualquer par usuário:senha solto — e as linhas do
 * code-frame são descartadas.
 */
function mensagemSegura(err: unknown): string | undefined {
  const bruto = err instanceof Error ? err.message : typeof err === "string" ? err : undefined;
  if (!bruto) return undefined;

  return bruto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    // Descarta o code-frame: linhas numeradas e a seta do apontador.
    .filter((l) => !/^\d+\s/.test(l) && !l.startsWith("→") && !l.startsWith("^"))
    .filter((l) => !l.startsWith("Invalid `") && !l.includes("invocation"))
    .join(" · ")
    .replace(/postgres(ql)?:\/\/\S+/gi, "[url removida]")
    .replace(/\b[\w.-]+:[^@\s/]+@/g, "[credencial removida]@")
    // O endereço do servidor também sai. Esta rota responde sem autenticação,
    // e publicar o host do banco entrega um alvo para tentativa de acesso. O
    // valor do diagnóstico está no MOTIVO ("não alcancei", "autenticação
    // recusada"), não em qual máquina — quem lê já sabe qual banco configurou.
    .replace(/\b[\w.-]+\.(neon\.tech|amazonaws\.com|supabase\.co|azure\.com)(:\d+)?/gi, "[servidor omitido]")
    .replace(/`[\w.-]+:\d+`/g, "`[servidor omitido]`")
    .slice(0, 300);
}

/**
 * Traduz o erro do Prisma para o que a pessoa precisa FAZER.
 *
 * Usa o CÓDIGO quando ele existe, e não o texto: procurar "does not exist" na
 * mensagem dava conselho errado quando o banco sequer respondia — mandava
 * rodar o SQL de criação numa situação em que o problema era a URL.
 *
 * Só há dois desfechos porque só há dois no que o client entrega: erro de
 * QUERY chega com `code` (P2021 = tabela ausente), enquanto erro de CONEXÃO
 * chega como PrismaClientInitializationError sem código nem texto
 * aproveitável — conferido nesta versão. Servidor fora do ar, porta errada,
 * banco inexistente e senha recusada são indistinguíveis aqui, e por sorte
 * pedem a mesma ação: conferir a connection string.
 */
function diagnosticar(err: unknown): { conecta: boolean; tabelasCriadas: boolean; codigo?: string; proximoPasso: string } {
  const erro = (err ?? {}) as { code?: unknown };
  const codigo = erro.code !== undefined && erro.code !== null ? String(erro.code) : undefined;

  if (codigo === "P2021" || codigo === "P2022") {
    return {
      conecta: true,
      tabelasCriadas: false,
      codigo,
      proximoPasso: "O banco responde, mas as tabelas não existem. Rode o arquivo banco-esquadrias.sql no SQL Editor do Neon.",
    };
  }

  return {
    conecta: false,
    tabelasCriadas: false,
    codigo,
    proximoPasso:
      "O banco não respondeu. Confira a ESQUADRIAS_DATABASE_URL na Vercel — tem que ser a URL COM -pooler do Neon, " +
      "completa e sem espaços. Os Runtime Logs da Vercel mostram o motivo exato.",
  };
}

/**
 * Confere o FORMATO da connection string sem devolver o conteúdo.
 *
 * Uma variável pode estar "ok" (preenchida) e ainda assim inutilizável: o
 * painel do Neon entrega a linha pronta como `DATABASE_URL="postgresql://..."`,
 * e quem copia o trecho inteiro acaba salvando as aspas junto. O valor não
 * fica vazio, então nenhuma checagem de presença acusa — e o sintoma é este,
 * "não conecta", que manda a pessoa procurar no lugar errado.
 */
function formatoDaUrl(bruto: string | undefined): { formato: string; pooled?: boolean } {
  if (!bruto) return { formato: "ausente" };

  if (bruto !== bruto.trim()) return { formato: "tem espaço em branco no começo ou no fim" };
  if (/^["']|["']$/.test(bruto)) return { formato: "está entre aspas — cole só o endereço, sem as aspas" };
  if (!/^postgres(ql)?:\/\//.test(bruto)) return { formato: "não começa com postgresql://" };

  try {
    const url = new URL(bruto);
    if (!url.hostname) return { formato: "sem servidor no endereço" };
    if (!url.password) return { formato: "sem senha no endereço" };
    return { formato: "ok", pooled: url.hostname.includes("-pooler") };
  } catch {
    return { formato: "não é um endereço válido" };
  }
}

export async function GET() {
  const variaveis = Object.fromEntries([...OBRIGATORIAS, ...OPCIONAIS].map((nome) => [nome, estado(nome)]));
  const urlBanco = formatoDaUrl(process.env.ESQUADRIAS_DATABASE_URL);
  const faltando = OBRIGATORIAS.filter((nome) => estado(nome) !== "ok");

  if (faltando.length > 0) {
    // Sem a URL do banco não adianta tentar conectar; sem o segredo o login
    // quebra de qualquer jeito. Responde já, com o que falta.
    return NextResponse.json(
      {
        saudavel: false,
        variaveis,
        urlDoBanco: urlBanco,
        banco: { testado: false },
        proximoPasso: `Preencha na Vercel: ${faltando.join(", ")} (Settings → Environment Variables) e faça Redeploy.`,
      },
      { status: 503 },
    );
  }

  try {
    // Conta tipologias em vez de um SELECT 1: responde de uma vez se o banco
    // atende E se o SQL de criação chegou a rodar.
    const tipologias = await prisma.tipologia.count();
    return NextResponse.json({
      saudavel: true,
      variaveis,
      urlDoBanco: urlBanco,
      banco: { testado: true, conecta: true, tabelasCriadas: true, tipologias },
      proximoPasso: tipologias > 0 ? "Tudo certo — acesse /login." : "Banco criado, mas vazio. Rode a parte de dados do banco-esquadrias.sql.",
    });
  } catch (err) {
    const { conecta, tabelasCriadas, codigo, proximoPasso } = diagnosticar(err);
    const detalhe = mensagemSegura(err);

    // Formato torto explica a falha de conexão melhor que qualquer conselho
    // genérico — e é a única pista que temos, já que o client do Prisma não
    // devolve o motivo real da falha de inicialização.
    const conselho =
      urlBanco.formato !== "ok"
        ? `A ESQUADRIAS_DATABASE_URL ${urlBanco.formato}. Corrija na Vercel e faça Redeploy.`
        : proximoPasso;

    return NextResponse.json(
      {
        saudavel: false,
        variaveis,
        urlDoBanco: urlBanco,
        banco: { testado: true, conecta, tabelasCriadas, codigo, detalhe },
        proximoPasso: conselho,
      },
      { status: 503 },
    );
  }
}
