/**
 * Modelos de mensagem da campanha: o texto que a pessoa escreve uma vez, com variáveis entre chaves, e que o preparo
 * da fila preenche para cada empresa. Tudo puro e testável. Variável desconhecida fica como está no texto, para a
 * pessoa ver na revisão que algo não foi preenchido, em vez de sumir.
 */

export const VARIAVEIS_DO_MODELO = {
  saudacao: "“Olá, João” com o decisor cadastrado; senão, só “Olá”",
  empresa: "nome da empresa",
  decisor: "primeiro nome do decisor (vazio se não houver)",
  autor: "seu primeiro nome",
  cidade: "cidade da empresa",
  uf: "estado da empresa",
  link_agenda: "link para agendar a demonstração",
  site: "site da empresa",
  instagram: "perfil do Instagram da empresa",
} as const;

export type VariavelDoModelo = keyof typeof VARIAVEIS_DO_MODELO;
export type ValoresDoModelo = Partial<Record<VariavelDoModelo, string | null>>;

/** Canais que têm modelo próprio na campanha. "OUTRO" não tem. */
export type CanalDoModelo = "WHATSAPP" | "EMAIL" | "LIGACAO" | "MENSAGEM";

export type ModelosDaCampanha = {
  modeloWhatsapp: string | null;
  modeloEmailAssunto: string | null;
  modeloEmail: string | null;
  modeloLigacao: string | null;
  modeloDirect: string | null;
};

const VARIAVEL = /\{([a-z_]+)\}/g;

/** As variáveis usadas no texto que o sistema não conhece. */
export function variaveisDesconhecidas(modelo: string): string[] {
  const achadas = new Set<string>();
  for (const m of modelo.matchAll(VARIAVEL)) if (!(m[1] in VARIAVEIS_DO_MODELO)) achadas.add(m[1]);
  return [...achadas];
}

/** Troca cada {variavel} conhecida pelo valor (vazio quando não há); desconhecidas ficam como estão. */
export function preencherModelo(modelo: string, valores: ValoresDoModelo): string {
  const texto = modelo.replace(VARIAVEL, (inteiro, nome: string) => (nome in VARIAVEIS_DO_MODELO ? (valores[nome as VariavelDoModelo] ?? "").trim() : inteiro));
  // Variável vazia não pode deixar ", ," nem espaço sobrando.
  return texto
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Valores a partir dos dados que já existem. O decisor e o autor entram só pelo primeiro nome. */
export function valoresDoModelo(d: {
  empresa: string;
  decisor?: string | null;
  autor: string;
  cidade?: string | null;
  uf?: string | null;
  linkAgenda?: string | null;
  site?: string | null;
  instagram?: string | null;
}): ValoresDoModelo {
  const primeiro = (s?: string | null) => (s ? s.replace(/\([^)]*\)/g, " ").trim().split(/\s+/)[0] ?? "" : "");
  const decisor = primeiro(d.decisor);
  return {
    saudacao: decisor ? `Olá, ${decisor}` : "Olá",
    empresa: d.empresa,
    decisor,
    autor: primeiro(d.autor) || d.autor,
    cidade: d.cidade ?? "",
    uf: d.uf ?? "",
    link_agenda: d.linkAgenda ?? "",
    site: d.site ?? "",
    instagram: d.instagram ?? "",
  };
}

const vazio = (s: string | null | undefined): s is null | undefined => !s || !s.trim();

/**
 * O texto da campanha para o canal, já preenchido, ou null quando a campanha não tem modelo para ele (aí vale o
 * modelo neutro). E-mail só usa o modelo se tiver corpo; sem assunto, o assunto fica a cargo de quem chamou.
 */
export function modeloDaCampanha(c: ModelosDaCampanha, canal: CanalDoModelo, valores: ValoresDoModelo): { assunto: string | null; texto: string } | null {
  const corpo = canal === "WHATSAPP" ? c.modeloWhatsapp : canal === "EMAIL" ? c.modeloEmail : canal === "LIGACAO" ? c.modeloLigacao : c.modeloDirect;
  if (vazio(corpo)) return null;
  const texto = preencherModelo(corpo, valores);
  if (!texto) return null;
  const assunto = canal === "EMAIL" && !vazio(c.modeloEmailAssunto) ? preencherModelo(c.modeloEmailAssunto, valores) || null : null;
  return { assunto, texto };
}

/** Se a campanha tem modelo para o canal (sem preencher). */
export function campanhaTemModelo(c: ModelosDaCampanha, canal: CanalDoModelo): boolean {
  const corpo = canal === "WHATSAPP" ? c.modeloWhatsapp : canal === "EMAIL" ? c.modeloEmail : canal === "LIGACAO" ? c.modeloLigacao : c.modeloDirect;
  return !vazio(corpo);
}

/* ----------------------------------------------------------------- Instagram ---- */

const USUARIO_INSTAGRAM = /^[a-z0-9._]{1,30}$/;
const RESERVADOS = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv", "direct"]);

/**
 * Aceita "@usuario", "usuario", "instagram.com/usuario" ou o link completo (com www, barra ou ?hl=pt no fim) e
 * devolve "https://instagram.com/usuario". Link de post, de reel ou texto que não é usuário vira null.
 */
export function normalizarInstagram(texto: string): string | null {
  let s = texto.trim().toLowerCase();
  if (!s) return null;
  const link = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/([^/?#\s]+)/);
  if (link) s = link[1];
  else if (/[/\s]/.test(s) || s.includes(".com")) return null;
  s = s.replace(/^@/, "");
  if (!USUARIO_INSTAGRAM.test(s) || RESERVADOS.has(s) || s.startsWith(".") || s.endsWith(".")) return null;
  return `https://instagram.com/${s}`;
}

/** "@usuario" a partir do link normalizado, para mostrar na tela. */
export function arrobaDoInstagram(link: string | null | undefined): string | null {
  const m = link?.match(/instagram\.com\/([^/?#]+)/);
  return m ? `@${m[1]}` : null;
}
