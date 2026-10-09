/**
 * Relatório de ligações: puro, sem banco e sem tela — pelo mesmo motivo dos
 * outros indicadores. "Taxa de atendimento" errada parece certa e vira cobrança
 * injusta de quem liga.
 *
 * Definições (o resto do arquivo só aplica):
 *
 *  - FEITA: ligação concluída DENTRO do período (pela data de conclusão).
 *  - TAXA DE ATENDIMENTO = atendeu / (atendeu + não atendeu + recado). Número
 *    inválido fica de fora: a pessoa não foi alcançada por problema do
 *    cadastro, não por quem ligou, e contá-lo puniria a equipe por um dado ruim.
 *  - NO PRAZO: concluída até o fim do dia do vencimento (horário de Brasília).
 *    Ligação marcada para 9h e feita às 15h está no prazo; cobrar a hora exata
 *    transformaria quase toda ligação em "atrasada".
 *  - TENTATIVAS ATÉ O CONTATO: para cada negociação cuja primeira ligação
 *    atendida caiu no período, quantas ligações com resultado foram feitas até
 *    e incluindo essa. Responde "quantas vezes preciso ligar até falar com o
 *    cliente?" — e olha o histórico todo da negociação, não só o período.
 */

export type Resultado = "ATENDEU" | "NAO_ATENDEU" | "RECADO" | "NUMERO_INVALIDO";

export type LigacaoIn = {
  id: string;
  negociacaoId: string;
  responsavelId: string | null;
  venceEm: Date;
  concluidaEm: Date | null;
  resultado: Resultado | null;
};

export type LinhaPessoa = {
  responsavelId: string | null;
  feitas: number;
  atendeu: number;
  taxaAtendimento: number | null;
  noPrazo: number;
  /** Pendentes e já vencidas hoje. */
  atrasadas: number;
};

export type DiaDeLigacoes = { dia: string; feitas: number; atendeu: number };

export type RelatorioLigacoes = {
  feitas: number;
  porResultado: Record<Resultado, number> & { semResultado: number };
  taxaAtendimento: number | null;
  /** Das ligações que venceram no período e foram concluídas: % no prazo. null sem nenhuma devida. */
  taxaNoPrazo: number | null;
  pendentesAtrasadas: number;
  /** Média de ligações até o primeiro atendimento. null sem nenhum caso. */
  tentativasMedias: number | null;
  /** Quantas negociações precisaram de 1, 2, 3, 4 e 5+ ligações até o contato. */
  distribuicaoTentativas: { tentativas: number; negociacoes: number }[];
  porPessoa: LinhaPessoa[];
  porDia: DiaDeLigacoes[];
};

const MS_3H = 3 * 3_600_000;

/** "2026-10-08" no horário de Brasília. */
export function diaBR(d: Date): string {
  return new Date(d.getTime() - MS_3H).toISOString().slice(0, 10);
}

const razao = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function calcularLigacoes(args: {
  ligacoes: LigacaoIn[];
  desde?: Date;
  ate?: Date;
  /** Quando informado, só esta pessoa ("sem" = sem responsável). */
  responsavelId?: string | "sem";
  agora: Date;
}): RelatorioLigacoes {
  const { agora } = args;
  const dentro = (d: Date) => (!args.desde || d >= args.desde) && (!args.ate || d <= args.ate);
  const daPessoa = (l: LigacaoIn) =>
    !args.responsavelId || (args.responsavelId === "sem" ? l.responsavelId === null : l.responsavelId === args.responsavelId);

  const escopo = args.ligacoes.filter(daPessoa);
  const feitas = escopo.filter((l) => l.concluidaEm && dentro(l.concluidaEm));

  const porResultado = { ATENDEU: 0, NAO_ATENDEU: 0, RECADO: 0, NUMERO_INVALIDO: 0, semResultado: 0 };
  for (const l of feitas) {
    if (l.resultado) porResultado[l.resultado] += 1;
    else porResultado.semResultado += 1;
  }
  const alcancaveis = porResultado.ATENDEU + porResultado.NAO_ATENDEU + porResultado.RECADO;

  // Prazo: só entram as que VENCERAM no período e já foram concluídas.
  const devidas = escopo.filter((l) => l.concluidaEm && dentro(l.venceEm));
  const noPrazo = (l: LigacaoIn) => diaBR(l.concluidaEm!) <= diaBR(l.venceEm);
  const devidasNoPrazo = devidas.filter(noPrazo).length;

  const pendentesAtrasadas = escopo.filter((l) => !l.concluidaEm && l.venceEm < agora).length;

  // Tentativas até o primeiro contato — sobre TODAS as ligações da negociação
  // (de qualquer pessoa), ordenadas pela conclusão.
  const porNegociacao = new Map<string, LigacaoIn[]>();
  for (const l of args.ligacoes) {
    if (!l.concluidaEm || !l.resultado) continue;
    const lista = porNegociacao.get(l.negociacaoId) ?? [];
    lista.push(l);
    porNegociacao.set(l.negociacaoId, lista);
  }
  const tentativas: number[] = [];
  for (const lista of porNegociacao.values()) {
    lista.sort((a, b) => a.concluidaEm!.getTime() - b.concluidaEm!.getTime());
    const i = lista.findIndex((l) => l.resultado === "ATENDEU");
    if (i < 0) continue;
    const primeira = lista[i];
    // Só conta no período em que o contato aconteceu, e para a pessoa filtrada.
    if (!dentro(primeira.concluidaEm!) || !daPessoa(primeira)) continue;
    tentativas.push(i + 1);
  }
  const distribuicao = [1, 2, 3, 4, 5].map((t) => ({
    tentativas: t,
    negociacoes: tentativas.filter((x) => (t === 5 ? x >= 5 : x === t)).length,
  }));

  // Por pessoa.
  const pessoas = new Map<string | null, LinhaPessoa>();
  const pessoa = (id: string | null) => {
    let p = pessoas.get(id);
    if (!p) {
      p = { responsavelId: id, feitas: 0, atendeu: 0, taxaAtendimento: null, noPrazo: 0, atrasadas: 0 };
      pessoas.set(id, p);
    }
    return p;
  };
  const alcancadas = new Map<string | null, number>();
  for (const l of feitas) {
    const p = pessoa(l.responsavelId);
    p.feitas += 1;
    if (l.resultado === "ATENDEU") p.atendeu += 1;
    if (l.resultado === "ATENDEU" || l.resultado === "NAO_ATENDEU" || l.resultado === "RECADO") {
      alcancadas.set(l.responsavelId, (alcancadas.get(l.responsavelId) ?? 0) + 1);
    }
  }
  for (const l of devidas) if (noPrazo(l)) pessoa(l.responsavelId).noPrazo += 1;
  for (const l of escopo) if (!l.concluidaEm && l.venceEm < agora) pessoa(l.responsavelId).atrasadas += 1;
  for (const p of pessoas.values()) p.taxaAtendimento = razao(p.atendeu, alcancadas.get(p.responsavelId) ?? 0);

  // Por dia (só dias com ligação, em ordem).
  const dias = new Map<string, DiaDeLigacoes>();
  for (const l of feitas) {
    const d = diaBR(l.concluidaEm!);
    const linha = dias.get(d) ?? { dia: d, feitas: 0, atendeu: 0 };
    linha.feitas += 1;
    if (l.resultado === "ATENDEU") linha.atendeu += 1;
    dias.set(d, linha);
  }

  return {
    feitas: feitas.length,
    porResultado,
    taxaAtendimento: razao(porResultado.ATENDEU, alcancaveis),
    taxaNoPrazo: razao(devidasNoPrazo, devidas.length),
    pendentesAtrasadas,
    tentativasMedias: tentativas.length ? tentativas.reduce((s, t) => s + t, 0) / tentativas.length : null,
    distribuicaoTentativas: distribuicao,
    porPessoa: [...pessoas.values()].sort((a, b) => b.feitas - a.feitas || b.atrasadas - a.atrasadas),
    porDia: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}
