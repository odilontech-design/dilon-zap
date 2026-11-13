import {
  formatarDioptria,
  formatarMilimetros,
  lerDioptria,
  lerEixo,
  lerMilimetros,
  lerReais,
} from "./otica-regras";

/**
 * Leitura da foto de uma OS do talão de papel: manda a imagem para a IA, recebe
 * os campos escritos e devolve tudo já no formato do formulário da OS.
 *
 * A leitura é sempre uma SUGESTÃO: quem salva é a atendente, depois de conferir
 * tela por tela. Por isso o que não passa nas regras da ótica (um grau fora do
 * passo de 0,25, uma data impossível) vira campo vazio e um aviso, e nunca um
 * valor chutado: grau errado é lente refeita.
 *
 * Provedor: Gemini (tem camada gratuita). A chave fica só no servidor
 * (GEMINI_API_KEY). Sem SDK, é um POST com fetch, e os testes trocam o fetch
 * por um falso. Rodar o teste com: npx tsx apps/web/lib/otica-leitura.test-manual.ts
 */

export const MODELO_PADRAO = "gemini-2.5-flash";
export const LIMITE_FOTO_BYTES = 8 * 1024 * 1024;
export const TIPOS_DE_FOTO = ["image/jpeg", "image/png", "image/webp"];

// Opções que o formulário conhece. O que a IA ler fora disto não é descartado:
// vai para as observações, para a atendente decidir.
const MATERIAIS_LENTE = ["Resina", "Policarbonato", "Trivex", "Cristal"];
const INDICES = ["1.50", "1.56", "1.59", "1.60", "1.67", "1.74"];
const TRATAMENTOS = ["Antirreflexo", "Antirrisco", "Fotossensível", "Filtro azul"];
const MATERIAIS_ARMACAO = ["Acetato", "Metal", "Fio de nylon", "Nylon"];
const SERVICOS = ["Montagem", "VTA", "Slim"];

export const PROMPT_DA_LEITURA = `Você lê a foto de uma ordem de serviço (OS) de uma ótica brasileira, preenchida à mão ou impressa em um talão de papel.
Copie o que está escrito, exatamente como está. Não corrija, não complete e não adivinhe.
Se um campo estiver em branco, ilegível ou você não tiver certeza, use null e acrescente o nome do campo em "duvidas".
Números de grau, medidas e valores devem vir como TEXTO, do jeito que aparecem (por exemplo "+2,25", "-0,50", "34,5", "725,00").
Datas no formato DD/MM/AAAA e horas no formato HH:MM.
Responda somente com um JSON neste formato, sem comentários:
{
 "numeroOS": string|null,
 "dataVenda": string|null,
 "cliente": {"nome":string|null,"telefone":string|null,"cpf":string|null,"rg":string|null,"nascimento":string|null,"cep":string|null,"endereco":string|null,"numero":string|null,"bairro":string|null,"cidade":string|null,"email":string|null},
 "receita": {"nomeUsuario":string|null,"medico":string|null,"crm":string|null,"dataConsulta":string|null,
   "longe":{"od":{"esf":string|null,"cil":string|null,"eixo":string|null,"dnp":string|null,"alt":string|null},"oe":{"esf":string|null,"cil":string|null,"eixo":string|null,"dnp":string|null,"alt":string|null}},
   "perto":{"od":{"esf":string|null,"cil":string|null,"eixo":string|null,"dnp":string|null,"alt":string|null},"oe":{"esf":string|null,"cil":string|null,"eixo":string|null,"dnp":string|null,"alt":string|null}},
   "adicao":{"od":string|null,"oe":string|null}},
 "lentes": string|null, "materialLente": string|null, "indiceLente": string|null,
 "tratamentos": string[], "tratamentoCor": string|null,
 "armacao": string|null, "materialArmacao": string|null, "servicos": string[],
 "medidas": {"ponte":string|null,"maiorDiagonal":string|null,"a":string|null,"b":string|null},
 "laboratorio": string|null, "pedidoLaboratorio": string|null,
 "previsaoData": string|null, "previsaoHora": string|null,
 "consultor": string|null,
 "valorTotal": string|null, "sinal": string|null, "formaDoSinal": "dinheiro"|"pix"|"cartao"|null,
 "observacoes": string|null, "portadorAutorizado": string|null,
 "duvidas": string[]
}
OD é o olho direito e OE o olho esquerdo. "a" é a medida horizontal da armação e "b" a vertical.`;

type Linha = { esferico: string; cilindrico: string; eixo: string; dnp: string; altura: string };
export type GradeTexto = { longe: { od: Linha; oe: Linha }; perto: { od: Linha; oe: Linha }; adicao: { od: string; oe: string } };

/** A leitura já no formato do formulário da OS: textos e datas AAAA-MM-DD. */
export type LeituraOS = {
  numero: number | null;
  dataVenda: string;
  cliente: { nome: string; telefone: string; documento: string; rgIe: string; nascimento: string; email: string; cep: string; logradouro: string; numeroEndereco: string; bairro: string; cidade: string };
  receita: { usuarioNome: string; medico: string; crm: string; dataConsulta: string; grade: GradeTexto };
  lentes: string;
  materialLente: string;
  indiceLente: string;
  tratamentos: string[];
  tratamentoCor: string;
  armacao: string;
  materialArmacao: string;
  servicos: string[];
  medidas: { ponte: string; diagonal: string; horizontal: string; vertical: string };
  laboratorioNome: string;
  pedidoLaboratorio: string;
  previsaoDia: string;
  previsaoHora: string;
  consultorNome: string;
  valor: string;
  sinal: string;
  meioDoSinal: "" | "DINHEIRO" | "PIX" | "CARTAO";
  observacoes: string;
  portadorAutorizado: string;
};

export type ResultadoDaLeitura = { leitura: LeituraOS; avisos: string[]; duvidas: string[] };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const txt = (v: unknown, max = 200): string => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => txt(x, 60)).filter(Boolean).slice(0, 12) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** "18/11/2026" ou "18/11/26" → "2026-11-18"; qualquer outra coisa → "". Data impossível também. */
export function lerDiaDoTalao(v: unknown): string {
  const m = txt(v, 20).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return "";
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mes = Number(m[2]);
  const dia = Number(m[1]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return "";
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function lerHora(v: unknown): string {
  const m = txt(v, 12).toLowerCase().match(/^(\d{1,2})(?::|h)?(\d{2})?$/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function reais(v: unknown, rotulo: string, avisos: string[]): string {
  const t = txt(v, 20);
  if (!t) return "";
  const c = lerReais(t);
  if (c === undefined || c === null) {
    avisos.push(`${rotulo}: não consegui ler "${t}"`);
    return "";
  }
  return (c / 100).toFixed(2).replace(".", ",");
}

/** O valor igual a uma das opções do formulário (sem diferenciar acento e maiúscula), ou "". */
function daLista(v: string, opcoes: string[]): string {
  const alvo = semAcento(v);
  return opcoes.find((o) => semAcento(o) === alvo) ?? "";
}

function linha(bruto: unknown, rotulo: string, avisos: string[]): Linha {
  const o = obj(bruto);
  const dioptria = (campo: string, v: unknown) => {
    const t = txt(v, 12);
    if (!t) return "";
    const r = lerDioptria(t);
    if (r.ok) return formatarDioptria(r.valor);
    avisos.push(`${rotulo} ${campo}: ${r.erro}`);
    return "";
  };
  const eixo = (() => {
    const t = txt(o.eixo, 8);
    if (!t) return "";
    const r = lerEixo(t);
    if (r.ok) return r.valor === null ? "" : String(r.valor);
    avisos.push(`${rotulo} eixo: ${r.erro}`);
    return "";
  })();
  const mm = (campo: string, v: unknown) => {
    const t = txt(v, 10);
    if (!t) return "";
    const r = lerMilimetros(t, 45);
    if (r.ok) return formatarMilimetros(r.valor);
    avisos.push(`${rotulo} ${campo}: ${r.erro}`);
    return "";
  };
  return { esferico: dioptria("esférico", o.esf), cilindrico: dioptria("cilíndrico", o.cil), eixo, dnp: mm("DNP", o.dnp), altura: mm("altura", o.alt) };
}

function milimetros(v: unknown, rotulo: string, avisos: string[]): string {
  const t = txt(v, 10);
  if (!t) return "";
  const r = lerMilimetros(t);
  if (r.ok) return formatarMilimetros(r.valor);
  avisos.push(`${rotulo}: ${r.erro}`);
  return "";
}

/** Transforma o JSON da IA no formato do formulário, descartando e avisando o que não é confiável. */
export function normalizarLeitura(bruto: unknown): ResultadoDaLeitura {
  const avisos: string[] = [];
  const j = obj(bruto);
  const c = obj(j.cliente);
  const r = obj(j.receita);
  const longe = obj(r.longe);
  const perto = obj(r.perto);
  const adicao = obj(r.adicao);
  const med = obj(j.medidas);
  const extras: string[] = [];

  const numeroTexto = txt(j.numeroOS, 12).replace(/\D/g, "");
  const numero = numeroTexto && numeroTexto.length <= 7 && Number(numeroTexto) > 0 ? Number(numeroTexto) : null;

  const dioptria = (rotulo: string, v: unknown) => {
    const t = txt(v, 12);
    if (!t) return "";
    const x = lerDioptria(t);
    if (x.ok) return formatarDioptria(x.valor);
    avisos.push(`${rotulo}: ${x.erro}`);
    return "";
  };

  const materialLente = daLista(txt(j.materialLente, 40), MATERIAIS_LENTE);
  if (txt(j.materialLente, 40) && !materialLente) extras.push(`Material da lente no talão: ${txt(j.materialLente, 40)}`);
  const indice = txt(j.indiceLente, 10).replace(",", ".");
  const indiceLente = INDICES.includes(indice) ? indice : "";
  if (indice && !indiceLente) extras.push(`Índice da lente no talão: ${indice}`);
  const materialArmacao = daLista(txt(j.materialArmacao, 40), MATERIAIS_ARMACAO);
  if (txt(j.materialArmacao, 40) && !materialArmacao) extras.push(`Material da armação no talão: ${txt(j.materialArmacao, 40)}`);

  const tratamentos: string[] = [];
  for (const t of lista(j.tratamentos)) {
    const ok = daLista(t, TRATAMENTOS);
    if (ok) tratamentos.push(ok);
    else extras.push(`Tratamento no talão: ${t}`);
  }
  const servicos: string[] = [];
  for (const s of lista(j.servicos)) {
    const ok = daLista(s, SERVICOS);
    if (ok) servicos.push(ok);
    else extras.push(`Serviço no talão: ${s}`);
  }

  const forma = txt(j.formaDoSinal, 12).toLowerCase();
  const meioDoSinal = forma === "dinheiro" ? "DINHEIRO" : forma === "pix" ? "PIX" : forma === "cartao" || forma === "cartão" ? "CARTAO" : "";

  const dataVenda = lerDiaDoTalao(j.dataVenda);
  const previsaoDia = lerDiaDoTalao(j.previsaoData);
  if (txt(j.previsaoData, 20) && !previsaoDia) avisos.push(`Previsão: não consegui ler a data "${txt(j.previsaoData, 20)}"`);

  const observacoes = [txt(j.observacoes, 1500), ...extras].filter(Boolean).join("\n");
  const duvidas = lista(j.duvidas);

  const leitura: LeituraOS = {
    numero,
    dataVenda,
    cliente: {
      nome: txt(c.nome, 120),
      telefone: txt(c.telefone, 30),
      documento: txt(c.cpf, 20),
      rgIe: txt(c.rg, 30),
      nascimento: lerDiaDoTalao(c.nascimento),
      email: txt(c.email, 160),
      cep: txt(c.cep, 10),
      logradouro: txt(c.endereco, 160),
      numeroEndereco: txt(c.numero, 20),
      bairro: txt(c.bairro, 80),
      cidade: txt(c.cidade, 80),
    },
    receita: {
      usuarioNome: txt(r.nomeUsuario, 120),
      medico: txt(r.medico, 120),
      crm: txt(r.crm, 30),
      dataConsulta: lerDiaDoTalao(r.dataConsulta),
      grade: {
        longe: { od: linha(obj(longe).od, "Longe OD", avisos), oe: linha(obj(longe).oe, "Longe OE", avisos) },
        perto: { od: linha(obj(perto).od, "Perto OD", avisos), oe: linha(obj(perto).oe, "Perto OE", avisos) },
        adicao: { od: dioptria("Adição OD", adicao.od), oe: dioptria("Adição OE", adicao.oe) },
      },
    },
    lentes: txt(j.lentes, 200),
    materialLente,
    indiceLente,
    tratamentos,
    tratamentoCor: txt(j.tratamentoCor, 120),
    armacao: txt(j.armacao, 200),
    materialArmacao,
    servicos,
    medidas: {
      ponte: milimetros(med.ponte, "Ponte", avisos),
      diagonal: milimetros(med.maiorDiagonal, "Maior diagonal", avisos),
      horizontal: milimetros(med.a, "Medida A", avisos),
      vertical: milimetros(med.b, "Medida B", avisos),
    },
    laboratorioNome: txt(j.laboratorio, 80),
    pedidoLaboratorio: txt(j.pedidoLaboratorio, 40),
    previsaoDia,
    previsaoHora: lerHora(j.previsaoHora),
    consultorNome: txt(j.consultor, 80),
    valor: reais(j.valorTotal, "Valor", avisos),
    sinal: reais(j.sinal, "Sinal", avisos),
    meioDoSinal,
    observacoes,
    portadorAutorizado: txt(j.portadorAutorizado, 120),
  };
  return { leitura, avisos, duvidas };
}

export class ErroDeLeitura extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

type Opcoes = { chave?: string; modelo?: string; fetchFn?: typeof fetch; signal?: AbortSignal };

/** Manda a foto à IA e devolve o JSON que ela escreveu (ainda cru: passe por normalizarLeitura). */
export async function lerFotoDaOS(foto: { base64: string; mime: string }, opcoes: Opcoes = {}): Promise<unknown> {
  // A chave vem de quem chama (a rota pede ao sdr-core): as chaves dos provedores só são lidas lá.
  const chave = (opcoes.chave ?? "").trim();
  // A mensagem vai para a atendente: o que ela pode fazer agora e quem resolve. A causa técnica fica no log.
  if (!chave) {
    console.error("[otica] leitura por foto desligada: falta GEMINI_API_KEY no servidor");
    throw new ErroDeLeitura("A leitura por foto ainda não foi ligada nesta conta. Preencha a OS à mão por enquanto e avise a Dilon Tech para ligar.", 503);
  }
  const modelo = opcoes.modelo ?? (process.env.OTICA_LEITURA_MODELO?.trim() || MODELO_PADRAO);
  const fetchFn = opcoes.fetchFn ?? fetch;

  const r = await fetchFn(`${process.env.GEMINI_API_BASE?.trim() || "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: "POST",
    signal: opcoes.signal,
    // A chave vai no cabeçalho, e não na URL, para não aparecer em log nem em mensagem de erro.
    headers: { "content-type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: PROMPT_DA_LEITURA }, { inlineData: { mimeType: foto.mime, data: foto.base64 } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 4000, responseMimeType: "application/json" },
    }),
  });
  if (r.status === 429) throw new ErroDeLeitura("A leitura por foto atingiu o limite gratuito por agora. Espere alguns minutos ou preencha à mão.", 429);
  if (!r.ok) {
    const corpo = (await r.text().catch(() => "")).slice(0, 160).replace(/\s+/g, " ");
    throw new ErroDeLeitura(`A leitura por foto falhou (${r.status})${corpo ? `: ${corpo.split(chave).join("[oculto]")}` : ""}`, 502);
  }
  const j = (await r.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const texto = (j?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!texto) throw new ErroDeLeitura("A leitura não devolveu nada. Tire outra foto, com mais luz e a folha inteira no quadro.", 422);
  try {
    // Alguns modelos embrulham o JSON em ``` mesmo pedindo JSON puro.
    return JSON.parse(texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    throw new ErroDeLeitura("Não consegui entender a resposta da leitura. Tire outra foto, mais nítida.", 422);
  }
}

/** Acha o item da lista cujo nome combina com o texto lido (igual, ou um contido no outro). */
export function acharPorNome<T extends { nome: string }>(itens: T[], lido: string): T | null {
  const alvo = semAcento(lido);
  if (alvo.length < 2) return null;
  const exato = itens.find((i) => semAcento(i.nome) === alvo);
  if (exato) return exato;
  const parecidos = itens.filter((i) => {
    const n = semAcento(i.nome);
    return n.includes(alvo) || alvo.includes(n);
  });
  return parecidos.length === 1 ? parecidos[0] : null;
}
