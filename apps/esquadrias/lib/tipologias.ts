import { validarFormula } from "@dilon-zap/esquadrias-core";
import { prisma } from "@dilon-zap/erp-db";
import { RespostaDeErro } from "@/lib/api";
import type { DadosTipologia } from "@/lib/schemas";

/** Variáveis que o motor injeta em toda fórmula, além dos parâmetros da tipologia. */
export const VARIAVEIS_BASE = ["L", "H", "Q", "largura", "altura", "quantidade", "AREA", "PERIMETRO"];

/**
 * Valida TODAS as fórmulas antes de gravar.
 *
 * Uma fórmula quebrada só aparece quando alguém tenta orçar com essa
 * tipologia — que pode ser semanas depois, na frente do cliente. Barrar aqui
 * custa uma checagem; barrar lá custa a venda.
 */
export function conferirFormulas(dados: DadosTipologia): void {
  const variaveis = [...VARIAVEIS_BASE, ...dados.parametros.map((p) => p.chave)];

  const conferir = (expressao: string, onde: string) => {
    const r = validarFormula(expressao, variaveis);
    if (!r.ok) throw new RespostaDeErro(400, `${onde}: ${r.erro}`);
  };

  for (const p of dados.pecas) {
    conferir(p.formulaQuantidade, `quantidade de "${p.descricao}"`);
    conferir(p.formulaComprimento, `comprimento de "${p.descricao}"`);
  }
  for (const v of dados.vidros) {
    conferir(v.formulaQuantidade, `quantidade de "${v.descricao}"`);
    conferir(v.formulaLargura, `largura de "${v.descricao}"`);
    conferir(v.formulaAltura, `altura de "${v.descricao}"`);
  }
  for (const f of dados.ferragens) {
    conferir(f.formulaQuantidade, `quantidade de "${f.descricao}"`);
  }

  if (dados.larguraMinMm > dados.larguraMaxMm) throw new RespostaDeErro(400, "largura mínima maior que a máxima");
  if (dados.alturaMinMm > dados.alturaMaxMm) throw new RespostaDeErro(400, "altura mínima maior que a máxima");
}

/**
 * Garante que perfil, vidro e ferragem referenciados são da MESMA empresa.
 *
 * Sem isso, mandar o id de um insumo de outro tenant faria a tipologia
 * calcular preço com a tabela de custo de um concorrente — e vazá-la de volta
 * no orçamento.
 */
export async function conferirInsumos(dados: DadosTipologia, empresaId: string): Promise<void> {
  const idsPerfil = [...new Set(dados.pecas.map((p) => p.perfilId))];
  const idsVidro = [...new Set(dados.vidros.map((v) => v.vidroId))];
  const idsFerragem = [...new Set(dados.ferragens.map((f) => f.ferragemId))];

  const [perfis, vidros, ferragens] = await Promise.all([
    prisma.perfil.count({ where: { empresaId, id: { in: idsPerfil } } }),
    prisma.vidro.count({ where: { empresaId, id: { in: idsVidro } } }),
    prisma.ferragem.count({ where: { empresaId, id: { in: idsFerragem } } }),
  ]);

  if (perfis !== idsPerfil.length) throw new RespostaDeErro(400, "há peça apontando para um perfil inexistente");
  if (vidros !== idsVidro.length) throw new RespostaDeErro(400, "há vidro inexistente na tipologia");
  if (ferragens !== idsFerragem.length) throw new RespostaDeErro(400, "há ferragem inexistente na tipologia");
}

/**
 * Confere o vão contra os limites da tipologia.
 *
 * Não é frescura de validação: uma janela de correr de 4 m com dois trilhos
 * não fecha, e o sistema que aceita a medida entrega um orçamento que a
 * produção vai ter que recusar depois de o cliente já ter assinado.
 */
export async function validarMedidas(tipologiaId: string, empresaId: string, larguraMm: number, alturaMm: number) {
  const tipologia = await prisma.tipologia.findFirst({ where: { id: tipologiaId, empresaId } });
  if (!tipologia) throw new RespostaDeErro(404, "tipologia não encontrada");

  if (larguraMm < tipologia.larguraMinMm || larguraMm > tipologia.larguraMaxMm) {
    throw new RespostaDeErro(400, `${tipologia.nome} aceita largura de ${tipologia.larguraMinMm} a ${tipologia.larguraMaxMm} mm`);
  }
  if (alturaMm < tipologia.alturaMinMm || alturaMm > tipologia.alturaMaxMm) {
    throw new RespostaDeErro(400, `${tipologia.nome} aceita altura de ${tipologia.alturaMinMm} a ${tipologia.alturaMaxMm} mm`);
  }

  return tipologia;
}
