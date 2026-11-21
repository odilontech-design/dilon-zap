import { createHash } from "node:crypto";

/**
 * Arquivos legais do REP-P (Portaria MTP nº 671/2021, arts. 79 a 88 e Anexo IX).
 *
 * Fonte dos leiautes: especificações publicadas no portal gov.br do Ministério
 * do Trabalho (arts. 81 e 83 remetem a elas):
 *   - "Leiaute do Arquivo Fonte de Dados - AFD", versão do leiaute "004";
 *   - "Leiaute do Arquivo Eletrônico de Jornada - AEJ", versão do leiaute "002".
 * (O texto compilado da Portaria ainda traz as versões 003/001 nos anexos; as
 * do portal são as vigentes.)
 *
 * Tudo aqui é puro: recebe dados já lidos do banco e devolve texto. A
 * assinatura CAdES/PAdES fica no app (precisa do certificado).
 *
 * Pontos que a especificação não fixa e que foram decididos aqui (revisar se o
 * Ministério publicar validador ou esclarecimento):
 *   - Campos numéricos (N) com valor são alinhados à direita com zeros
 *     (NSR "000000001", CPF "012345678901"); campos alfanuméricos (A) e
 *     numéricos sem valor (CNO/CAEPF inexistente) ficam à esquerda com espaços
 *     (item 7 do leiaute).
 *   - O código hash SHA-256 é gravado em hexadecimal minúsculo.
 */

// ── formatação ────────────────────────────────────────────────────────────

/** "AAAA-MM-ddThh:mm:00ZZZZZ" no fuso informado (24 caracteres). Os segundos são sempre "00". */
export function dataHoraRep(instante: Date, fuso: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const v = (t: string) => partes.find((p) => p.type === t)!.value;
  const local = Date.UTC(Number(v("year")), Number(v("month")) - 1, Number(v("day")), Number(v("hour")), Number(v("minute")));
  const semSegundos = Math.floor(instante.getTime() / 60_000) * 60_000;
  const offsetMin = Math.round((local - semSegundos) / 60_000);
  const sinal = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const zzzz = `${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:00${sinal}${zzzz}`;
}

/** "AAAA-MM-dd" no fuso informado. */
export function dataRep(instante: Date, fuso: string): string {
  return dataHoraRep(instante, fuso).slice(0, 10);
}

const soDigitos = (s: string) => s.replace(/\D/g, "");

/** Numérico: alinhado à direita com zeros; sem valor, espaços. */
function num(valor: string | number | null | undefined, tamanho: number): string {
  if (valor == null || valor === "") return " ".repeat(tamanho);
  const d = soDigitos(String(valor));
  if (d.length > tamanho) throw new Error(`Valor numérico maior que o campo (${tamanho}): ${d}`);
  return d.padStart(tamanho, "0");
}

/** Alfanumérico: à esquerda, espaços à direita, cortado no tamanho. */
function alfa(valor: string | null | undefined, tamanho: number): string {
  return paraLatin1(valor ?? "").slice(0, tamanho).padEnd(tamanho, " ");
}

/** Troca o que não existe em ISO 8859-1 por equivalente, para o arquivo não sair com "?". */
export function paraLatin1(texto: string): string {
  return texto
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[\r\n|]/g, " ")
    .replace(/[^\u0000-ÿ]/g, (c) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\u0000-ÿ]/g, "?"));
}

// ── CRC-16 e hash ─────────────────────────────────────────────────────────

/**
 * CRC-16/KERMIT (CCITT-TRUE): polinômio 0x1021 refletido (0x8408), valor
 * inicial 0, sem XOR final. Pela especificação, "123456789" → "2189". O
 * resultado é gravado em 4 caracteres hexadecimais, nessa ordem.
 */
export function crc16Kermit(texto: string): string {
  let crc = 0x0000;
  for (const byte of Buffer.from(texto, "latin1")) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  // A especificação manda gravar "2189" para o valor 0x2189.
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface MarcacaoRep {
  nsr: number;
  /** Data e hora da marcação (a do aparelho, se feita sem internet). */
  marcadaEm: Date;
  /** Data e hora da gravação do registro no servidor. */
  gravadaEm: Date;
  cpf: string;
  /** "01" aplicativo mobile; "02" navegador. */
  coletor: "01" | "02" | "03" | "04" | "05";
  offline: boolean;
}

/** Campos 1 a 7 do registro tipo "7", já formatados (são a base do hash). */
function camposTipo7(m: MarcacaoRep, fuso: string): string {
  return (
    num(m.nsr, 9) +
    "7" +
    dataHoraRep(m.marcadaEm, fuso) +
    num(m.cpf, 12) +
    dataHoraRep(m.gravadaEm, fuso) +
    m.coletor +
    (m.offline ? "1" : "0")
  );
}

/**
 * Código hash SHA-256 da marcação (campo 8 do registro tipo "7"): calculado
 * sobre os campos 1 a 7 e o hash do registro tipo "7" anterior, se existir.
 * Qualquer pessoa consegue recalcular a partir do próprio AFD.
 */
export function hashMarcacaoRep(m: MarcacaoRep, fuso: string, hashAnterior: string | null): string {
  return createHash("sha256")
    .update(Buffer.from(camposTipo7(m, fuso) + (hashAnterior ?? ""), "latin1"))
    .digest("hex");
}

/** Recalcula a cadeia inteira, em ordem de NSR. Devolve o hash de cada marcação. */
export function cadeiaDeHashes(marcacoes: MarcacaoRep[], fuso: string): string[] {
  const hashes: string[] = [];
  let anterior: string | null = null;
  for (const m of [...marcacoes].sort((a, b) => a.nsr - b.nsr)) {
    anterior = hashMarcacaoRep(m, fuso, anterior);
    hashes.push(anterior);
  }
  return hashes;
}

// ── AFD ───────────────────────────────────────────────────────────────────

export const TEXTO_ASSINATURA_P7S = "ASSINATURA_DIGITAL_EM_ARQUIVO_P7S";

export interface EmpregadorRep {
  /** CNPJ (14) ou CPF (11), só dígitos. */
  documento: string;
  /** CNO ou CAEPF, quando existir. */
  cnoOuCaepf?: string | null;
  razaoSocial: string;
}

export interface DesenvolvedorRep {
  documento: string;
  /** Número de registro do programa no INPI. */
  registroInpi: string;
}

export type EventoRep =
  | {
      tipo: 2;
      nsr: number;
      gravadoEm: Date;
      cpfResponsavel: string;
      empregador: EmpregadorRep;
      localPrestacao: string;
    }
  | {
      tipo: 5;
      nsr: number;
      gravadoEm: Date;
      operacao: "I" | "A" | "E";
      cpf: string;
      nome: string;
      cpfResponsavel: string;
    }
  | {
      tipo: 6;
      nsr: number;
      gravadoEm: Date;
      /** "07" disponibilidade de serviço; "08" indisponibilidade de serviço. */
      evento: "02" | "07" | "08";
    };

export interface EntradaAfd {
  empregador: EmpregadorRep;
  desenvolvedor: DesenvolvedorRep;
  fuso: string;
  /** Período pedido ("AAAA-MM-dd"); vai no cabeçalho. */
  dataInicial: string;
  dataFinal: string;
  geradoEm: Date;
  eventos: EventoRep[];
  marcacoes: Array<MarcacaoRep & { hash: string }>;
}

const tipoDoc = (doc: string) => (soDigitos(doc).length === 11 ? "2" : "1");
const comCrc = (registro: string) => registro + crc16Kermit(registro);

export function registroCabecalhoAfd(e: EntradaAfd): string {
  return comCrc(
    "000000000" +
      "1" +
      tipoDoc(e.empregador.documento) +
      alfa(soDigitos(e.empregador.documento), 14) +
      num(e.empregador.cnoOuCaepf, 14) +
      alfa(e.empregador.razaoSocial, 150) +
      num(e.desenvolvedor.registroInpi, 17) +
      e.dataInicial +
      e.dataFinal +
      dataHoraRep(e.geradoEm, e.fuso) +
      "004" +
      tipoDoc(e.desenvolvedor.documento) +
      alfa(soDigitos(e.desenvolvedor.documento), 14) +
      alfa("", 30),
  );
}

export function registroEventoAfd(ev: EventoRep, fuso: string): string {
  const base = num(ev.nsr, 9) + String(ev.tipo) + dataHoraRep(ev.gravadoEm, fuso);
  if (ev.tipo === 2) {
    return comCrc(
      base +
        num(ev.cpfResponsavel, 14) +
        tipoDoc(ev.empregador.documento) +
        alfa(soDigitos(ev.empregador.documento), 14) +
        num(ev.empregador.cnoOuCaepf, 14) +
        alfa(ev.empregador.razaoSocial, 150) +
        alfa(ev.localPrestacao, 100),
    );
  }
  if (ev.tipo === 5) {
    return comCrc(base + ev.operacao + num(ev.cpf, 12) + alfa(ev.nome, 52) + alfa("", 4) + num(ev.cpfResponsavel, 11));
  }
  // Tipo 6 não leva CRC (o item 8 do leiaute pede CRC só nos tipos 1 a 5).
  return base + ev.evento;
}

export function registroMarcacaoAfd(m: MarcacaoRep & { hash: string }, fuso: string): string {
  if (!/^[0-9a-f]{64}$/.test(m.hash)) throw new Error(`Hash inválido na marcação NSR ${m.nsr}`);
  return camposTipo7(m, fuso) + m.hash;
}

/**
 * Gera o AFD (texto ISO 8859-1, linhas terminadas em CR LF, ordenado por NSR,
 * sem linhas em branco). A última linha é o registro de assinatura, que aponta
 * para o arquivo .p7s destacado.
 */
export function gerarAfd(e: EntradaAfd): { texto: string; bytes: Buffer } {
  const corpo: Array<{ nsr: number; linha: string }> = [
    ...e.eventos.map((ev) => ({ nsr: ev.nsr, linha: registroEventoAfd(ev, e.fuso) })),
    ...e.marcacoes.map((m) => ({ nsr: m.nsr, linha: registroMarcacaoAfd(m, e.fuso) })),
  ].sort((a, b) => a.nsr - b.nsr);

  const conta = (t: number) => e.eventos.filter((ev) => ev.tipo === t).length;
  const trailer =
    "999999999" +
    num(conta(2), 9) +
    num(0, 9) + // tipo 3: só REP-C e REP-A
    num(0, 9) + // tipo 4: o REP-P usa o relógio do servidor, sem ajuste manual
    num(conta(5), 9) +
    num(conta(6), 9) +
    num(e.marcacoes.length, 9) +
    "9";

  const linhas = [registroCabecalhoAfd(e), ...corpo.map((c) => c.linha), trailer, alfa(TEXTO_ASSINATURA_P7S, 100)];
  const texto = linhas.join("\r\n") + "\r\n";
  return { texto, bytes: Buffer.from(texto, "latin1") };
}

/** "AFD" + nº INPI + CNPJ/CPF do empregador + "REP_P" (item 10.3 do leiaute). */
export function nomeArquivoAfd(registroInpi: string, documentoEmpregador: string): string {
  return `AFD${soDigitos(registroInpi)}${soDigitos(documentoEmpregador)}REP_P.txt`;
}

// ── AEJ ───────────────────────────────────────────────────────────────────

export interface HorarioContratualAej {
  codigo: string;
  /** Minutos, já com a hora noturna reduzida. */
  duracaoMin: number;
  /** Pares "hhmm". */
  pares: Array<[string, string]>;
}

export interface MarcacaoAej {
  vinculo: number;
  dataHora: Date;
  /** "E" entrada, "S" saída, "D" desconsiderada. */
  tipo: "E" | "S" | "D";
  /** Número do par entrada/saída no dia (1, 2, ...). */
  par: number;
  /** "O" original do REP, "I" incluída manualmente. */
  fonte: "O" | "I";
  /** Obrigatório na primeira entrada do dia. */
  codHorario?: string | null;
  /** Obrigatório se desconsiderada ou incluída. */
  motivo?: string | null;
}

export interface AusenciaAej {
  vinculo: number;
  /** 1 DSR; 2 falta não justificada; 3 movimento no banco de horas; 4 folga compensatória de feriado. */
  tipo: 1 | 2 | 3 | 4;
  data: string;
  minutos?: number;
  /** 1 inclusão no banco; 2 compensação. Obrigatório se tipo 3. */
  movimentoBanco?: 1 | 2;
}

export interface EntradaAej {
  empregador: EmpregadorRep & { caepf?: string | null; cno?: string | null };
  fuso: string;
  dataInicial: string;
  dataFinal: string;
  geradoEm: Date;
  registroInpi: string;
  vinculos: Array<{ id: number; cpf: string; nome: string }>;
  horarios: HorarioContratualAej[];
  marcacoes: MarcacaoAej[];
  ausencias: AusenciaAej[];
  programa: { nome: string; versao: string; documentoDesenvolvedor: string; razaoDesenvolvedor: string; email: string };
}

const campo = (v: string | number | null | undefined) => paraLatin1(v == null ? "" : String(v));
const linhaAej = (...campos: Array<string | number | null | undefined>) => campos.map(campo).join("|");

/** Gera o AEJ (campos separados por "|", ISO 8859-1, CR LF). */
export function gerarAej(e: EntradaAej): { texto: string; bytes: Buffer } {
  const r01 = [
    linhaAej(
      "01",
      tipoDoc(e.empregador.documento),
      soDigitos(e.empregador.documento),
      e.empregador.caepf ? soDigitos(e.empregador.caepf) : "",
      e.empregador.cno ? soDigitos(e.empregador.cno) : "",
      e.empregador.razaoSocial.slice(0, 150),
      e.dataInicial,
      e.dataFinal,
      dataHoraRep(e.geradoEm, e.fuso),
      "002",
    ),
  ];
  // Um REP só: o próprio Dilon Ponto (REP-P), identificado pelo registro no INPI.
  const r02 = [linhaAej("02", 1, 3, soDigitos(e.registroInpi))];
  const r03 = e.vinculos.map((v) => linhaAej("03", v.id, soDigitos(v.cpf).padStart(11, "0"), v.nome.slice(0, 150)));
  const r04 = e.horarios.map((h) => linhaAej("04", h.codigo.slice(0, 30), h.duracaoMin, ...h.pares.flat()));
  const r05 = [...e.marcacoes]
    .sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime() || a.vinculo - b.vinculo)
    .map((m) => {
      if ((m.tipo === "D" || m.fonte === "I") && !m.motivo) throw new Error("Marcação tratada sem motivo no AEJ");
      return linhaAej(
        "05",
        m.vinculo,
        dataHoraRep(m.dataHora, e.fuso),
        // Marcação original vem do REP 1; incluída manualmente não tem REP.
        m.fonte === "O" ? 1 : "",
        m.tipo,
        String(m.par).padStart(3, "0"),
        m.fonte,
        m.tipo === "E" && m.par === 1 ? (m.codHorario ?? "") : "",
        m.tipo === "D" || m.fonte === "I" ? (m.motivo ?? "").slice(0, 150) : "",
      );
    });
  const r07 = e.ausencias.map((a) =>
    linhaAej("07", a.vinculo, a.tipo, a.data, a.tipo === 3 ? (a.minutos ?? 0) : "", a.tipo === 3 ? (a.movimentoBanco ?? "") : ""),
  );
  const r08 = [
    linhaAej(
      "08",
      e.programa.nome.slice(0, 150),
      e.programa.versao.slice(0, 8),
      tipoDoc(e.programa.documentoDesenvolvedor),
      soDigitos(e.programa.documentoDesenvolvedor),
      e.programa.razaoDesenvolvedor.slice(0, 150),
      e.programa.email.slice(0, 50),
    ),
  ];
  const r99 = [linhaAej("99", r01.length, r02.length, r03.length, r04.length, r05.length, 0, r07.length, r08.length)];
  const linhas = [...r01, ...r02, ...r03, ...r04, ...r05, ...r07, ...r08, ...r99, TEXTO_ASSINATURA_P7S.padEnd(100, " ")];
  const texto = linhas.join("\r\n") + "\r\n";
  return { texto, bytes: Buffer.from(texto, "latin1") };
}

export function nomeArquivoAej(documentoEmpregador: string, dataInicial: string, dataFinal: string): string {
  return `AEJ_${soDigitos(documentoEmpregador)}_${dataInicial}_${dataFinal}.txt`;
}
