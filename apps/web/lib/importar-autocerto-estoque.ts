import { prisma } from "@dilon-zap/db";
import { chaveDoCarro, lerPlanilhaAutoCerto, type LinhaAutoCerto } from "@/lib/importar-autocerto";
import { registrarEvento } from "@/lib/veiculos";
import { STATUS_NO_PATIO, placaParaTela } from "@/lib/veiculos-regras";

/**
 * Completa as fichas que já estão no Zap (importadas do site) com a planilha
 * do AutoCerto: placa, preço, FIPE, data de entrada, ano de fabricação e a km
 * quando a planilha a tem. Casa carro por carro pela marca, modelo, versão, ano
 * do modelo e cor, e só vale o par que é único dos dois lados.
 *
 * Nunca sobrescreve o que alguém já preencheu: só entra onde o campo está vazio
 * (preço 0, sem placa, sem FIPE, km não informada). Carro com o mesmo par
 * repetido ou sem par fica de fora e é listado.
 */

export class ErroPlanilhaAutoCerto extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type ResultadoAutoCerto = {
  linhas: number;
  casados: number;
  semCarro: number;
  carrosSemLinha: number;
  ambiguos: number;
  aplicados: number;
  preenche: { placa: number; preco: number; fipe: number; km: number; entrada: number; anoFabricacao: number };
  /** Placa da planilha que já está em outro carro do estoque: não é aplicada. */
  placasRepetidas: string[];
  linhasComProblema: { numero: number; erro: string }[];
  previa: { nome: string; placa: string | null; precoCents: number; fipeCents: number | null; temKm: boolean }[];
};

export async function completarComPlanilha(input: { tenantId: string; userId: string; texto: string; simular: boolean }): Promise<ResultadoAutoCerto> {
  const lida = lerPlanilhaAutoCerto(input.texto);
  if (lida.faltando.length) throw new ErroPlanilhaAutoCerto(`não reconheci a planilha do AutoCerto (faltam as colunas: ${lida.faltando.join(", ")}). Exporte o estoque pelo AutoCerto e envie o arquivo como ele vem.`);
  if (!lida.linhas.length) throw new ErroPlanilhaAutoCerto("a planilha não tem carros");
  if (lida.linhas.length > 2000) throw new ErroPlanilhaAutoCerto("a planilha passa de 2.000 carros");

  const carros = await prisma.veiculo.findMany({
    where: { tenantId: input.tenantId, status: { in: STATUS_NO_PATIO } },
    select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true, cor: true, placa: true, precoCents: true, fipeCents: true, km: true, kmInformado: true, entradaEm: true, siteOrigemId: true, createdAt: true },
  });

  const porChave = new Map<string, typeof carros>();
  for (const c of carros) porChave.set(chaveDoCarro(c), [...(porChave.get(chaveDoCarro(c)) ?? []), c]);
  const linhasPorChave = new Map<string, LinhaAutoCerto[]>();
  for (const l of lida.linhas) linhasPorChave.set(chaveDoCarro(l), [...(linhasPorChave.get(chaveDoCarro(l)) ?? []), l]);

  const placasEmUso = new Map(carros.filter((c) => c.placa).map((c) => [c.placa!, c.id]));
  const res: ResultadoAutoCerto = {
    linhas: lida.linhas.length,
    casados: 0,
    semCarro: 0,
    carrosSemLinha: 0,
    ambiguos: 0,
    aplicados: 0,
    preenche: { placa: 0, preco: 0, fipe: 0, km: 0, entrada: 0, anoFabricacao: 0 },
    placasRepetidas: [],
    linhasComProblema: lida.erros,
    previa: [],
  };
  const agora = new Date();
  const usadas = new Set<string>();

  for (const [chave, linhas] of linhasPorChave) {
    const candidatos = porChave.get(chave) ?? [];
    if (!candidatos.length) {
      res.semCarro += linhas.length;
      continue;
    }
    if (candidatos.length !== 1 || linhas.length !== 1) {
      res.ambiguos += linhas.length;
      continue;
    }
    const carro = candidatos[0];
    const l = linhas[0];
    usadas.add(carro.id);
    res.casados++;

    const dados: Record<string, unknown> = {};
    const campos: string[] = [];
    if (!carro.placa && l.placa) {
      const dono = placasEmUso.get(l.placa);
      if (dono && dono !== carro.id) res.placasRepetidas.push(placaParaTela(l.placa));
      else {
        dados.placa = l.placa;
        placasEmUso.set(l.placa, carro.id);
        campos.push("placa");
        res.preenche.placa++;
      }
    }
    if (carro.precoCents <= 0 && l.precoCents > 0) {
      dados.precoCents = l.precoCents;
      campos.push("preço");
      res.preenche.preco++;
    }
    if (!carro.fipeCents && l.fipeCents) {
      dados.fipeCents = l.fipeCents;
      dados.fipeEm = agora;
      campos.push("FIPE");
      res.preenche.fipe++;
    }
    if (!carro.kmInformado && l.km) {
      dados.km = l.km;
      dados.kmInformado = true;
      campos.push("km");
      res.preenche.km++;
    }
    // Só nos carros que vieram do site: lá o ano de fabricação é copiado do ano do modelo e a data de entrada é a do dia da importação.
    if (carro.siteOrigemId) {
      if (carro.anoFabricacao === carro.anoModelo && l.anoFabricacao !== carro.anoFabricacao && l.anoFabricacao <= l.anoModelo) {
        dados.anoFabricacao = l.anoFabricacao;
        campos.push("ano de fabricação");
        res.preenche.anoFabricacao++;
      }
      if (l.cadastro && l.cadastro <= agora && l.cadastro < carro.entradaEm) {
        dados.entradaEm = l.cadastro;
        campos.push("data de entrada");
        res.preenche.entrada++;
      }
    }

    if (res.previa.length < 8) res.previa.push({ nome: `${carro.marca} ${carro.modelo}${carro.versao ? ` ${carro.versao}` : ""} ${carro.anoModelo}`, placa: l.placa, precoCents: l.precoCents, fipeCents: l.fipeCents, temKm: !!l.km });
    if (!campos.length) continue;
    res.aplicados++;
    if (input.simular) continue;
    await prisma.$transaction(async (tx) => {
      await tx.veiculo.update({ where: { id: carro.id }, data: dados });
      await registrarEvento(tx, carro.id, "ficha", `Completado com a planilha do AutoCerto: ${campos.join(", ")}`, input.userId);
    });
  }
  res.carrosSemLinha = carros.filter((c) => !usadas.has(c.id) && !(linhasPorChave.get(chaveDoCarro(c))?.length)).length;
  return res;
}
