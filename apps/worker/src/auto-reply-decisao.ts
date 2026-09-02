// Qual resposta automática sai — e nenhum efeito colateral aqui dentro.
//
// Isso morava dentro de maybeAutoReply, colado em quatro consultas ao banco.
// São quatro caminhos que se excluem e duas marcas de "já mandei", e a única
// forma de conferir a combinação certa era ler o código e acreditar. Separado,
// dá pra escrever a tabela de decisão inteira num teste.

// Só o que a decisão precisa saber de uma regra. Menos que o registro do
// Prisma de propósito: o teste não deveria ter que inventar id e createdAt.
export type RegraAuto = {
  keyword: string;
  response: string;
  isDefault: boolean;
  isGreeting: boolean;
};

export type EntradaDecisao = {
  regras: RegraAuto[];
  textoRecebido: string;
  foraDoHorario: boolean;
  mensagemAusencia: string | null;
  ausenciaAvisadaEm: Date | null;
  saudacaoEnviadaEm: Date | null;
  agora: Date;
  ausenciaIntervaloMs: number;
};

export type Decisao = {
  texto: string;
  marcarAusencia: boolean;
  marcarSaudacao: boolean;
};

/**
 * Uma mensagem recebida gera NO MÁXIMO uma resposta. Por isso ausência,
 * saudação e resposta padrão são decididas juntas, e não em automações
 * separadas: separadas, um cliente novo escrevendo às 22h levaria a saudação
 * E o aviso de que estamos fechados, duas mensagens seguidas do nada.
 *
 * Ordem: palavra-chave, ausência, saudação, padrão.
 *
 * A palavra-chave ganha sempre — é específica e útil a qualquer hora.
 *
 * A saudação fica DEPOIS da ausência de propósito. Cliente novo que escreve
 * às 22h precisa saber que ninguém vai responder agora, mais do que precisa
 * de boas-vindas. E ele não perde a saudação: quem decide não marca nada,
 * quem grava marca só depois de enfileirar de fato. Então ele recebe a
 * saudação na primeira mensagem dentro do expediente.
 *
 * Retorna null quando a resposta certa é ficar calado.
 */
export function decidirAutoResposta(e: EntradaDecisao): Decisao | null {
  const texto = e.textoRecebido.toLowerCase();

  // Saudação e padrão não têm palavra-chave; a busca por palavra tem que
  // ignorar as duas explicitamente, senão uma keyword vazia casaria com
  // qualquer mensagem (includes("") é sempre true).
  const porPalavraChave = e.regras.find(
    (r) => !r.isDefault && !r.isGreeting && r.keyword && texto.includes(r.keyword.toLowerCase())
  );
  if (porPalavraChave) {
    return { texto: porPalavraChave.response, marcarAusencia: false, marcarSaudacao: false };
  }

  if (e.foraDoHorario && e.mensagemAusencia) {
    // Trava anti-spam: cliente que manda cinco mensagens de madrugada recebe
    // UM aviso, não cinco. Sem isso a automação vira motivo de reclamação.
    const jaAvisou =
      e.ausenciaAvisadaEm != null &&
      e.agora.getTime() - e.ausenciaAvisadaEm.getTime() < e.ausenciaIntervaloMs;
    if (jaAvisou) return null; // silêncio de propósito
    return { texto: e.mensagemAusencia, marcarAusencia: true, marcarSaudacao: false };
  }

  // Saudação de primeiro contato: só pra quem nunca recebeu, e só se a
  // empresa configurou uma. É o pedido da Camila — cliente que escreve só
  // "bom dia" não casa com palavra-chave nenhuma e ficava sem resposta.
  if (!e.saudacaoEnviadaEm) {
    const saudacao = e.regras.find((r) => r.isGreeting);
    if (saudacao) {
      return { texto: saudacao.response, marcarAusencia: false, marcarSaudacao: true };
    }
  }

  const padrao = e.regras.find((r) => r.isDefault);
  if (padrao) return { texto: padrao.response, marcarAusencia: false, marcarSaudacao: false };

  return null;
}
