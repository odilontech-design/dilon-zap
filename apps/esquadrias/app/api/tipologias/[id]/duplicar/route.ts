import { prisma } from "@dilon-zap/erp-db";
import { exigirPapel, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";

type Ctx = { params: { id: string } };

/**
 * Duplica a tipologia com as fórmulas.
 *
 * É o caminho real de adoção: a serralheria não escreve a primeira tipologia
 * do zero — ela pega a "Janela 2 folhas" que já veio, duplica e troca o
 * perfil pela linha que ela compra. Sem duplicar, cada variação vira uma hora
 * de digitação e o cliente desiste na segunda.
 */
export const POST = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);

  const original = await prisma.tipologia.findFirst({
    where: { id: params.id, empresaId: usuario.empresaId },
    include: { parametros: true, pecas: true, vidros: true, ferragens: true },
  });
  if (!original) throw new RespostaDeErro(404, "tipologia não encontrada");

  // Nome único por empresa: acha o primeiro sufixo livre em vez de estourar
  // no unique quando alguém duplica duas vezes.
  const base = `${original.nome} (cópia)`;
  let nome = base;
  for (let i = 2; await prisma.tipologia.findFirst({ where: { empresaId: usuario.empresaId, nome } }); i++) {
    nome = `${base} ${i}`;
  }

  const copia = await prisma.tipologia.create({
    data: {
      empresaId: usuario.empresaId,
      linhaId: original.linhaId,
      nome,
      categoria: original.categoria,
      descricao: original.descricao,
      desenhoSvg: original.desenhoSvg,
      larguraMinMm: original.larguraMinMm,
      larguraMaxMm: original.larguraMaxMm,
      alturaMinMm: original.alturaMinMm,
      alturaMaxMm: original.alturaMaxMm,
      formulaMaoDeObra: original.formulaMaoDeObra,
      parametros: { create: original.parametros.map((p) => ({ chave: p.chave, rotulo: p.rotulo, valorPadrao: p.valorPadrao, ordem: p.ordem })) },
      pecas: {
        create: original.pecas.map((p) => ({
          perfilId: p.perfilId,
          descricao: p.descricao,
          corte: p.corte,
          formulaQuantidade: p.formulaQuantidade,
          formulaComprimento: p.formulaComprimento,
          ordem: p.ordem,
        })),
      },
      vidros: {
        create: original.vidros.map((v) => ({
          vidroId: v.vidroId,
          descricao: v.descricao,
          formulaQuantidade: v.formulaQuantidade,
          formulaLargura: v.formulaLargura,
          formulaAltura: v.formulaAltura,
          ordem: v.ordem,
        })),
      },
      ferragens: {
        create: original.ferragens.map((f) => ({
          ferragemId: f.ferragemId,
          descricao: f.descricao,
          formulaQuantidade: f.formulaQuantidade,
          ordem: f.ordem,
        })),
      },
    },
  });

  return ok(copia, 201);
});
