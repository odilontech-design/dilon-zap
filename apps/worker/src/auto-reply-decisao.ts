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

// Uma opção do menu de triagem, do jeito que a decisão precisa dela.
export type OpcaoUra = {
  ordem: number;
  rotulo: string;
  atendenteId: string;
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
  // Menu de triagem. uraAtiva desligada, ou sem opção nenhuma, faz todo o
  // bloco da URA sumir da decisão — a empresa que não usa menu segue com o
  // comportamento antigo, sem nenhum desvio.
  uraAtiva: boolean;
  uraMensagem: string | null;
  uraOpcoes: OpcaoUra[];
  uraEnviadaEm: Date | null;
  uraReenvios: number;
};

export type Decisao = {
  texto: string;
  marcarAusencia: boolean;
  marcarSaudacao: boolean;
  // Efeitos do menu de triagem. Quem grava é o chamador — aqui só se decide.
  marcarUraEnviada?: boolean;
  contarReenvioUra?: boolean;
  /** Atendente que passa a ser dono da conversa. */
  atribuirPara?: string;
};

/** Quantas vezes o menu é reapresentado antes de o robô se calar. */
export const URA_MAX_REENVIOS = 1;

/**
 * Texto do menu: cabeçalho da empresa + as opções, uma por linha.
 *
 * Montado na hora, e não guardado pronto, porque senão renomear uma opção
 * exigiria reescrever a mensagem inteira à mão — e no dia em que alguém
 * esquecesse, o menu ofereceria um setor com o nome antigo.
 */
export function montarMenuUra(cabecalho: string | null, opcoes: OpcaoUra[]) {
  const linhas = [...opcoes]
    .sort((a, b) => a.ordem - b.ordem)
    .map((o) => `${o.ordem} - ${o.rotulo}`)
    .join("\n");
  const topo = cabecalho?.trim();
  return topo ? `${topo}\n\n${linhas}` : linhas;
}

/**
 * Qual opção o cliente escolheu — ou null se ele escreveu outra coisa.
 *
 * O casamento é deliberadamente estreito: só o número sozinho (com a
 * pontuação que as pessoas costumam usar, "1)", "1.", "opção 1") ou o nome
 * exato da opção. Procurar o dígito solto em qualquer lugar do texto acharia
 * "preciso de 1 boleto" e mandaria o cliente pro setor errado calado — erro
 * pior do que não entender, porque ninguém percebe que aconteceu.
 */
export function casarOpcaoUra(texto: string, opcoes: OpcaoUra[]): OpcaoUra | null {
  const limpo = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  const soNumero = limpo.match(/^(?:opcao\s*)?(\d{1,2})\s*[.)\-–]?$/);
  if (soNumero) {
    const escolhida = Number(soNumero[1]);
    return opcoes.find((o) => o.ordem === escolhida) ?? null;
  }

  return (
    opcoes.find(
      (o) =>
        o.rotulo
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "") === limpo
    ) ?? null
  );
}

/**
 * Uma mensagem recebida gera NO MÁXIMO uma resposta. Por isso ausência,
 * saudação e resposta padrão são decididas juntas, e não em automações
 * separadas: separadas, um cliente novo escrevendo às 22h levaria a saudação
 * E o aviso de que estamos fechados, duas mensagens seguidas do nada.
 *
 * Ordem: palavra-chave, ausência, menu de triagem, saudação, padrão.
 *
 * A palavra-chave ganha sempre — é específica e útil a qualquer hora.
 *
 * A saudação fica DEPOIS da ausência de propósito. Cliente novo que escreve
 * às 22h precisa saber que ninguém vai responder agora, mais do que precisa
 * de boas-vindas. E ele não perde a saudação: quem decide não marca nada,
 * quem grava marca só depois de enfileirar de fato. Então ele recebe a
 * saudação na primeira mensagem dentro do expediente.
 *
 * O menu de triagem entra no lugar da saudação, nunca junto: o menu JÁ é a
 * mensagem de boas-vindas, e mandar os dois seria cumprimentar o cliente
 * duas vezes seguidas pra depois pedir que ele escolha um número.
 *
 * Retorna null quando a resposta certa é ficar calado.
 */
export function decidirAutoResposta(e: EntradaDecisao): Decisao | null {
  const texto = e.textoRecebido.toLowerCase();
  const menuLigado = e.uraAtiva && e.uraOpcoes.length > 0;

  // A escolha do menu vem antes de tudo, inclusive da palavra-chave, mas SÓ
  // depois que o menu foi mostrado: o cliente está respondendo uma pergunta
  // que a gente acabou de fazer. Sem isso, uma empresa com a palavra-chave
  // "financeiro" e a opção "Financeiro" no menu responderia o texto da
  // palavra-chave e deixaria a conversa sem dono — o cliente escolheu, viu
  // uma resposta e mesmo assim ninguém foi acionado.
  if (menuLigado && e.uraEnviadaEm) {
    const escolhida = casarOpcaoUra(e.textoRecebido, e.uraOpcoes);
    if (escolhida) {
      return {
        texto: `Certo! Encaminhando para ${escolhida.rotulo}. Já já alguém te responde por aqui.`,
        marcarAusencia: false,
        marcarSaudacao: false,
        atribuirPara: escolhida.atendenteId,
      };
    }
  }

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

  // Menu de triagem: mostrar pela primeira vez nesta conversa, ou insistir
  // com quem já viu e respondeu outra coisa (a escolha certa já foi tratada
  // lá em cima, antes da palavra-chave).
  if (menuLigado) {
    if (!e.uraEnviadaEm) {
      return {
        texto: montarMenuUra(e.uraMensagem, e.uraOpcoes),
        marcarAusencia: false,
        // Menu e saudação são a mesma mensagem de boas-vindas. Marcar a
        // saudação junto evita que o cliente receba a saudação "atrasada"
        // depois, no dia em que a empresa desligar o menu.
        marcarSaudacao: true,
        marcarUraEnviada: true,
      };
    }

    if (e.uraReenvios < URA_MAX_REENVIOS) {
      return {
        texto: montarMenuUra(
          "Não entendi. Responda com o número de uma das opções:",
          e.uraOpcoes
        ),
        marcarAusencia: false,
        marcarSaudacao: false,
        contarReenvioUra: true,
      };
    }

    // Já reapresentamos e o cliente continua escrevendo texto livre. Silêncio
    // de propósito: a conversa fica sem dono na fila, visível pra equipe, que
    // é melhor do que um robô repetindo o menu pra quem quer falar com gente.
    return null;
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
