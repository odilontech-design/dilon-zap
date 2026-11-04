/**
 * Normalização dos campos de uma empresa vinda do CSV. Tudo puro e testável.
 *
 * Regra de ouro: só se aceita o que está no arquivo. Valor que não passa na
 * validação é descartado com um aviso (ou rejeita a linha, no caso do CNPJ),
 * nunca "corrigido" por palpite.
 */

export const CAMPOS = ["cnpj", "razaoSocial", "nomeFantasia", "telefone", "email", "site", "uf", "cidade", "segmento", "porte", "cnae"] as const;
export type Campo = (typeof CAMPOS)[number];
export type Bruto = Partial<Record<Campo, string>>;

export const ROTULO_CAMPO: Record<Campo, string> = {
  cnpj: "CNPJ",
  razaoSocial: "Razão social",
  nomeFantasia: "Nome fantasia",
  telefone: "Telefone",
  email: "E-mail",
  site: "Site",
  uf: "Estado (UF)",
  cidade: "Cidade",
  segmento: "Segmento",
  porte: "Porte",
  cnae: "CNAE",
};

export const UFS_BRASIL = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export type Porte = "MEI" | "ME" | "EPP" | "MEDIA" | "GRANDE";

export type EmpresaNormalizada = {
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  dominio: string | null;
  emailDominio: string | null;
  uf: string | null;
  cidade: string | null;
  segmento: string | null;
  porte: Porte | null;
  cnae: string | null;
  chaveNome: string;
};

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const colapsar = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
/** Minúsculas, sem acento e sem espaços repetidos: a forma de comparar texto. */
export const comparavel = (s: string) => colapsar(semAcento(s)).toLowerCase();

/* ---------------------------------------------------------------- CNPJ ---- */

const valorDoCaractere = (c: string) => c.charCodeAt(0) - 48;

/**
 * Dígitos verificadores do CNPJ, no cálculo da Receita (módulo 11). Vale para o
 * numérico e para o alfanumérico que passou a existir em 2026: cada caractere
 * entra com o código ASCII menos 48, então A vale 17.
 */
export function digitosVerificadoresDoCnpj(base12: string): string {
  const calcular = (texto: string) => {
    let peso = texto.length - 7;
    let soma = 0;
    for (const c of texto) {
      soma += valorDoCaractere(c) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calcular(base12);
  const d2 = calcular(base12 + d1);
  return `${d1}${d2}`;
}

export function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;
  return digitosVerificadoresDoCnpj(cnpj.slice(0, 12)) === cnpj.slice(12);
}

export type ResultadoCnpj = { cnpj: string; aviso?: string } | { erro: string };

/**
 * Aceita máscara, espaços e o zero à esquerda que o Excel costuma comer. O
 * zero só é devolvido se o resultado fechar nos dígitos verificadores: um CNPJ
 * "completado" que não confere é recusado, não adivinhado.
 */
export function normalizarCnpj(texto: string): ResultadoCnpj {
  const limpo = texto.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (limpo === "") return { erro: "CNPJ vazio" };
  if (limpo.length === 14) {
    return cnpjValido(limpo) ? { cnpj: limpo } : { erro: "CNPJ inválido (os dígitos verificadores não conferem)" };
  }
  if (limpo.length < 14 && /^\d+$/.test(limpo) && limpo.length >= 8) {
    const completo = limpo.padStart(14, "0");
    if (cnpjValido(completo)) return { cnpj: completo, aviso: "CNPJ completado com zeros à esquerda" };
  }
  return { erro: "CNPJ inválido (precisa ter 14 caracteres)" };
}

export function formatarCnpj(cnpj: string): string {
  return cnpj.length === 14 ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : cnpj;
}

/* ---------------------------------------------------------------- Nomes ---- */

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para"]);
const SIGLAS = new Set(["LTDA", "ME", "EPP", "MEI", "EIRELI", "SA", "S/A", "SS", "CIA", "S.A.", "S.A", "LTDA.", "ME.", "EPP.", "CNPJ", "II", "III", "IV", "TI", "RH", "DP"]);

/** Nome TODO EM MAIÚSCULAS (ou todo em minúsculas) vira "Título"; o que já está misto fica como veio. */
export function tituloDoNome(nome: string): string {
  const limpo = colapsar(nome).replace(/^["']+|["']+$/g, "").trim();
  const letras = limpo.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras === "") return limpo;
  const todoMaiusculo = letras === letras.toUpperCase();
  const todoMinusculo = letras === letras.toLowerCase();
  if (!todoMaiusculo && !todoMinusculo) return limpo;
  return limpo
    .split(" ")
    .map((palavra, i) => {
      if (SIGLAS.has(palavra.toUpperCase())) return palavra.toUpperCase();
      const minuscula = palavra.toLowerCase();
      if (i > 0 && MINUSCULAS.has(minuscula)) return minuscula;
      return minuscula.replace(/(^|[-'/(])([a-zà-ÿ])/g, (_, antes: string, letra: string) => antes + letra.toUpperCase());
    })
    .join(" ");
}

const SUFIXOS = new Set(["ltda", "eireli", "epp", "me", "mei", "sa", "ss", "cia", "sociedade", "limitada"]);

/** Sem acento, pontuação nem sufixo societário: "Clínica São José Ltda." e "CLINICA SAO JOSE" dão a mesma chave. */
export function chaveDoNome(nome: string): string {
  const palavras = comparavel(nome)
    .replace(/s\s*\/\s*a\b/g, "sa")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
  while (palavras.length > 1 && SUFIXOS.has(palavras[palavras.length - 1])) palavras.pop();
  return palavras.join(" ");
}

/* ------------------------------------------------------------- Contatos ---- */

export type ResultadoCampo<T> = { valor: T | null; aviso?: string };

/** Primeiro telefone brasileiro válido da célula. Devolve só dígitos, com o 55. */
export function normalizarTelefone(texto: string): ResultadoCampo<string> {
  const candidatos = texto.split(/[\/;|,]|\sou\s/i).map((c) => c.trim()).filter(Boolean);
  let indiceUsado = -1;
  let achado: string | null = null;
  candidatos.forEach((candidato, indice) => {
    if (achado) return;
    let d = candidato.replace(/\D/g, "").replace(/^0+/, "");
    if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
    if (d.length !== 10 && d.length !== 11) return;
    if (!/^[1-9][1-9]/.test(d)) return;
    // 11 dígitos: celular, começa com 9. 10 dígitos: fixo, começa com 2 a 5.
    if (d.length === 11 && d[2] !== "9") return;
    if (d.length === 10 && !/[2-5]/.test(d[2])) return;
    achado = `55${d}`;
    indiceUsado = indice;
  });
  if (achado) return { valor: achado, aviso: indiceUsado > 0 ? "usado o primeiro telefone válido da célula" : undefined };
  return { valor: null, aviso: `telefone inválido ignorado: ${colapsar(texto).slice(0, 40)}` };
}

const REGEX_EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]{2,}$/;

/** Provedores comuns: um e-mail @gmail.com não identifica a empresa. */
export const DOMINIOS_GENERICOS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br", "live.com", "msn.com",
  "yahoo.com", "yahoo.com.br", "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br", "globo.com", "globomail.com",
  "icloud.com", "me.com", "protonmail.com", "proton.me", "zipmail.com.br", "r7.com", "oi.com.br", "bighost.com.br",
]);

/** Redes sociais e agregadores: o "site" existe, mas não identifica a empresa. */
export const DOMINIOS_DE_REDE = new Set([
  "instagram.com", "facebook.com", "fb.com", "linktr.ee", "wa.me", "whatsapp.com", "api.whatsapp.com", "linkedin.com", "twitter.com",
  "x.com", "tiktok.com", "youtube.com", "youtu.be", "google.com", "goo.gl", "bit.ly", "sites.google.com", "wixsite.com",
  "business.site", "mercadolivre.com.br", "olx.com.br", "ifood.com.br", "beacons.ai", "carrd.co",
]);

export function dominioDoEmail(email: string): string | null {
  const dominio = email.split("@")[1]?.toLowerCase() ?? "";
  return dominio && !DOMINIOS_GENERICOS.has(dominio) ? dominio : null;
}

export function normalizarEmail(texto: string): ResultadoCampo<string> {
  const candidatos = texto.split(/[;,\s]+/).map((c) => c.trim().toLowerCase()).filter(Boolean);
  const valido = candidatos.find((c) => c.length <= 254 && REGEX_EMAIL.test(c));
  if (valido) return { valor: valido };
  return { valor: null, aviso: `e-mail inválido ignorado: ${colapsar(texto).slice(0, 40)}` };
}

export function normalizarSite(texto: string): ResultadoCampo<{ site: string; dominio: string | null }> {
  const bruto = colapsar(texto);
  const falha = (): ResultadoCampo<{ site: string; dominio: string | null }> => ({ valor: null, aviso: `site inválido ignorado: ${bruto.slice(0, 40)}` });
  if (!bruto || bruto.includes("@") || bruto.includes(" ")) return falha();
  if (/^[a-z][a-z0-9+.-]*:/i.test(bruto) && !/^https?:\/\//i.test(bruto)) return falha();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`);
  } catch {
    return falha();
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host.length > 120) return falha();
  const caminho = url.pathname.replace(/\/+$/, "");
  const generico = DOMINIOS_DE_REDE.has(host) || [...DOMINIOS_DE_REDE].some((d) => host.endsWith(`.${d}`));
  return { valor: { site: `https://${host}${caminho}`, dominio: generico ? null : host } };
}

/* ----------------------------------------------------------------- Local ---- */

const NOMES_DOS_ESTADOS: Record<string, string> = {
  acre: "AC", alagoas: "AL", amazonas: "AM", amapa: "AP", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES",
  goias: "GO", maranhao: "MA", "minas gerais": "MG", "mato grosso do sul": "MS", "mato grosso": "MT", para: "PA", paraiba: "PB",
  pernambuco: "PE", piaui: "PI", parana: "PR", "rio de janeiro": "RJ", "rio grande do norte": "RN", rondonia: "RO", roraima: "RR",
  "rio grande do sul": "RS", "santa catarina": "SC", sergipe: "SE", "sao paulo": "SP", tocantins: "TO",
};

export function normalizarUf(texto: string): ResultadoCampo<string> {
  const c = comparavel(texto);
  const sigla = c.toUpperCase();
  if ((UFS_BRASIL as readonly string[]).includes(sigla)) return { valor: sigla };
  if (NOMES_DOS_ESTADOS[c]) return { valor: NOMES_DOS_ESTADOS[c] };
  return { valor: null, aviso: `UF inválida ignorada: ${colapsar(texto).slice(0, 30)}` };
}

export function normalizarCidade(texto: string): ResultadoCampo<string> {
  const limpo = colapsar(texto);
  if (limpo === "") return { valor: null };
  if (limpo.length > 80) return { valor: null, aviso: "cidade longa demais, ignorada" };
  return { valor: tituloDoNome(limpo) };
}

/* ----------------------------------------------------- Porte, CNAE, ramo ---- */

const PORTES: Record<string, Porte> = {
  mei: "MEI", microempreendedor: "MEI", "microempreendedor individual": "MEI",
  me: "ME", micro: "ME", microempresa: "ME", "micro empresa": "ME",
  epp: "EPP", pequena: "EPP", pequeno: "EPP", "pequeno porte": "EPP", "pequena empresa": "EPP", "empresa de pequeno porte": "EPP",
  media: "MEDIA", medio: "MEDIA", "media empresa": "MEDIA", "medio porte": "MEDIA",
  grande: "GRANDE", "grande empresa": "GRANDE", "grande porte": "GRANDE",
};

export function normalizarPorte(texto: string): ResultadoCampo<Porte> {
  const porte = PORTES[comparavel(texto).replace(/[^a-z ]/g, "").trim()];
  return porte ? { valor: porte } : { valor: null, aviso: `porte não reconhecido, ignorado: ${colapsar(texto).slice(0, 30)}` };
}

export function normalizarCnae(texto: string): ResultadoCampo<string> {
  const d = texto.replace(/\D/g, "");
  return d.length === 7 ? { valor: d } : { valor: null, aviso: `CNAE precisa ter 7 dígitos, ignorado: ${colapsar(texto).slice(0, 20)}` };
}

export function normalizarSegmento(texto: string): ResultadoCampo<string> {
  const limpo = colapsar(texto);
  if (limpo === "") return { valor: null };
  return limpo.length > 80 ? { valor: null, aviso: "segmento longo demais, ignorado" } : { valor: limpo };
}

/* ----------------------------------------------------------------- Linha ---- */

export type LinhaNormalizada =
  | { ok: true; empresa: EmpresaNormalizada; avisos: string[] }
  | { ok: false; erros: string[]; avisos: string[] };

const vazio = (v: string | undefined): v is undefined => v === undefined || colapsar(v) === "";

/** Valida e normaliza uma linha. Erro = rejeita a linha; aviso = descarta só o campo. */
export function normalizarLinha(bruto: Bruto): LinhaNormalizada {
  const erros: string[] = [];
  const avisos: string[] = [];
  const guardarAviso = (r: { aviso?: string }) => {
    if (r.aviso) avisos.push(r.aviso);
  };

  let cnpj: string | null = null;
  if (vazio(bruto.cnpj)) {
    avisos.push("sem CNPJ: a deduplicação usa site ou nome e estado");
  } else {
    const r = normalizarCnpj(bruto.cnpj);
    if ("erro" in r) erros.push(r.erro);
    else {
      cnpj = r.cnpj;
      guardarAviso(r);
    }
  }

  const nome = (valor: string | undefined, rotulo: string) => {
    if (vazio(valor)) return null;
    const n = tituloDoNome(valor);
    if (n.length > 200) {
      erros.push(`${rotulo} longa demais (máximo de 200 caracteres)`);
      return null;
    }
    return n || null;
  };
  const razaoSocial = nome(bruto.razaoSocial, "razão social");
  const nomeFantasia = nome(bruto.nomeFantasia, "nome fantasia");
  if (!razaoSocial && !nomeFantasia && !erros.some((e) => e.includes("longa demais"))) {
    erros.push("informe a razão social ou o nome fantasia");
  }
  const chaveNome = chaveDoNome(razaoSocial ?? nomeFantasia ?? "");
  if ((razaoSocial || nomeFantasia) && chaveNome === "") erros.push("o nome não tem letras nem números");

  let telefone: string | null = null;
  if (!vazio(bruto.telefone)) {
    const r = normalizarTelefone(bruto.telefone);
    telefone = r.valor;
    guardarAviso(r);
  }
  let email: string | null = null;
  if (!vazio(bruto.email)) {
    const r = normalizarEmail(bruto.email);
    email = r.valor;
    guardarAviso(r);
  }
  let site: string | null = null;
  let dominio: string | null = null;
  if (!vazio(bruto.site)) {
    const r = normalizarSite(bruto.site);
    site = r.valor?.site ?? null;
    dominio = r.valor?.dominio ?? null;
    guardarAviso(r);
  }
  let uf: string | null = null;
  if (!vazio(bruto.uf)) {
    const r = normalizarUf(bruto.uf);
    uf = r.valor;
    guardarAviso(r);
  }
  let cidade: string | null = null;
  if (!vazio(bruto.cidade)) {
    const r = normalizarCidade(bruto.cidade);
    cidade = r.valor;
    guardarAviso(r);
  }
  let segmento: string | null = null;
  if (!vazio(bruto.segmento)) {
    const r = normalizarSegmento(bruto.segmento);
    segmento = r.valor;
    guardarAviso(r);
  }
  let porte: Porte | null = null;
  if (!vazio(bruto.porte)) {
    const r = normalizarPorte(bruto.porte);
    porte = r.valor;
    guardarAviso(r);
  }
  let cnae: string | null = null;
  if (!vazio(bruto.cnae)) {
    const r = normalizarCnae(bruto.cnae);
    cnae = r.valor;
    guardarAviso(r);
  }

  if (erros.length) return { ok: false, erros, avisos };
  return {
    ok: true,
    avisos,
    empresa: {
      cnpj,
      razaoSocial,
      nomeFantasia,
      telefone,
      email,
      site,
      dominio,
      emailDominio: email ? dominioDoEmail(email) : null,
      uf,
      cidade,
      segmento,
      porte,
      cnae,
      chaveNome,
    },
  };
}
