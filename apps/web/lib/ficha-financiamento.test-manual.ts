// Ficha de financiamento do site. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/ficha-financiamento.test-manual.ts
import { randomBytes } from "node:crypto";
process.env.PORTAIS_CHAVE = randomBytes(32).toString("base64");
delete process.env.FICHAS_CHAVE;

import { prisma } from "@dilon-zap/db";
import { conferirFicha, configDaFicha, cpfValido, dinheiroEmCentavos, FICHA_PADRAO } from "./ficha-campos";
import { abrirFicha, apagarFicha, apagarFichasVencidas, chaveDasFichas, fichaDaLoja, fichasDaNegociacao, registrarFichaDoSite, salvarConfigDaFicha } from "./ficha-financiamento";
import { lojaPublica } from "./vitrine";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const CPF = "529.982.247-25";
const pessoais = { nome: "Maria da Silva", cpf: CPF, nascimento: "1990-05-10", telefone: "(21) 98888-7777", email: "maria@exemplo.com", estadoCivil: "Casado(a)" };
const endereco = { cep: "25071-182", logradouro: "Rua A", numero: "10", bairro: "Centro", cidade: "Duque de Caxias", uf: "RJ", tipoResidencia: "Alugada" };
const profissional = { empresa: "Empresa X", salario: "4.500,00" };
const ficha = (extra: object = {}) => ({ pessoais, endereco, profissional, refPessoais: [{ nome: "João", telefone: "21977776666" }], refBancarias: [{ banco: "Itaú", agencia: "1234", conta: "5678-9" }], veiculo: { entrada: "15.000", parcelas: "48" }, ...extra });

async function main() {
  // regras puras
  checa("CPF: válido, com dígito errado e repetido", [cpfValido(CPF), cpfValido("529.982.247-24"), cpfValido("111.111.111-11")], [true, false, false]);
  checa("configuração: padrão e limites", [configDaFicha(null), configDaFicha({ refPessoais: 9, refBancarias: -1, completa: "sim" }).refPessoais], [FICHA_PADRAO, 3]);
  checa("dinheiro em centavos", [dinheiroEmCentavos("4.500,00"), dinheiroEmCentavos("R$ 15.000"), dinheiroEmCentavos("abc")], [450000, 1500000, null]);
  const cfg = { ...FICHA_PADRAO, completa: true };
  checa("ficha sem CPF válido é recusada", conferirFicha(cfg, ficha({ pessoais: { ...pessoais, cpf: "123" } })), { ok: false, erro: "Dados pessoais: CPF inválido" });
  checa("falta referência bancária obrigatória", conferirFicha(cfg, ficha({ refBancarias: [] })), { ok: false, erro: "Referências bancárias 1: preencha banco" });
  checa("estado civil fora da lista é recusado", conferirFicha(cfg, ficha({ pessoais: { ...pessoais, estadoCivil: "<b>x" } })).ok, false);
  const semConjuge = conferirFicha(cfg, ficha({ conjuge: { nome: "Zé", cpf: CPF } }));
  checa("só ficam as seções que a loja pede (cônjuge desligado some)", semConjuge.ok ? [semConjuge.secoes, "conjuge" in semConjuge.dados] : null, [["pessoais", "endereco", "profissional", "refPessoais", "refBancarias", "veiculo"], false]);

  // chave
  checa("chave: derivada de PORTAIS_CHAVE, diferente dela; sem nada = nula", [chaveDasFichas()?.length, chaveDasFichas()?.equals(Buffer.from(process.env.PORTAIS_CHAVE!, "base64")), chaveDasFichas({} as NodeJS.ProcessEnv)], [32, false, null]);

  // de ponta a ponta
  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-ficha", "teste-ficha-2"] } } });
  const t = await prisma.tenant.create({ data: { name: "Loja Ficha", slug: "teste-ficha" } });
  const t2 = await prisma.tenant.create({ data: { name: "Outra", slug: "teste-ficha-2" } });
  await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "VEICULOS", ativo: true, motivo: "teste" } });
  await prisma.veiculosConfig.create({ data: { tenantId: t.id, vitrineAtiva: true } });
  const carro = await prisma.veiculo.create({ data: { tenantId: t.id, marca: "Fiat", modelo: "Cronos", anoFabricacao: 2024, anoModelo: 2025, km: 1000, kmInformado: true, precoCents: 9_000_000, status: "DISPONIVEL", origem: "COMPRA", naVitrine: true } });
  const carroOutra = await prisma.veiculo.create({ data: { tenantId: t2.id, marca: "VW", modelo: "Gol", anoFabricacao: 2020, anoModelo: 2020, km: 1, kmInformado: true, precoCents: 1, status: "DISPONIVEL", origem: "COMPRA" } });
  const loja = (await lojaPublica("teste-ficha"))!;

  checa("loja com o padrão: formulário curto (a ficha completa é recusada)", [(await fichaDaLoja(t.id)).completa, (await registrarFichaDoSite({ loja, ficha: ficha(), consentimento: true })).ok], [false, false]);
  await salvarConfigDaFicha(t.id, { completa: true });
  checa("sem consentimento é recusada", await registrarFichaDoSite({ loja, ficha: ficha(), consentimento: false }), { ok: false, erro: "para enviar, autorize o uso dos dados para a análise de crédito" });

  const agora = new Date("2026-11-15T12:00:00Z");
  const r = await registrarFichaDoSite({ loja, ficha: ficha({ veiculo: { veiculoId: carro.id, entrada: "15.000", parcelas: "48" } }), consentimento: true, agora });
  checa("ficha aceita", r.ok, true);
  const negId = r.ok ? r.negociacaoId : "";
  const neg = await prisma.negociacao.findUniqueOrThrow({ where: { id: negId }, include: { tarefas: true } });
  checa("negociação com o carro, a entrada e a origem, sem CPF em título e tarefa", [neg.origem, neg.valorCents, neg.titulo.includes("Cronos"), JSON.stringify(neg).includes("529"), neg.tarefas[0]?.titulo.includes("entrada R$")], ["Site · Financiamento", 9_000_000, true, false, true]);
  const guardada = await prisma.fichaFinanciamento.findFirstOrThrow({ where: { negociacaoId: negId } });
  checa("no banco a ficha está cifrada (sem CPF, nome nem salário legíveis) e vence em 180 dias", [guardada.dados.startsWith("v1."), /529|Maria|4\.500|Itaú/.test(guardada.dados), guardada.apagarEm.toISOString()], [true, false, "2027-05-14T12:00:00.000Z"]);

  const lista = await fichasDaNegociacao(t.id, negId);
  checa("lista da negociação sem dados sensíveis", [lista.length, Object.keys(lista[0]).sort()], [1, ["apagarEm", "createdAt", "id", "secoes"]]);
  const aberta = await abrirFicha(t.id, negId, guardada.id);
  checa("abrir: dados de volta, consentimento e o carro descrito", [aberta?.pessoais.cpf, aberta?.profissional?.salario, aberta?.refBancarias?.[0].banco, aberta?.consentimentoEm, aberta?.veiculoNome?.startsWith("Fiat Cronos 2024/2025")], [CPF, "4.500,00", "Itaú", "2026-11-15T12:00:00.000Z", true]);
  checa("outra loja não abre nem apaga", [await abrirFicha(t2.id, negId, guardada.id), await apagarFicha(t2.id, negId, guardada.id)], [null, false]);

  const r2 = await registrarFichaDoSite({ loja, ficha: ficha({ veiculo: { veiculoId: carroOutra.id } }), consentimento: true, agora });
  const f2 = r2.ok ? await prisma.fichaFinanciamento.findFirstOrThrow({ where: { negociacaoId: r2.negociacaoId }, orderBy: { createdAt: "desc" } }) : null;
  checa("carro de outra loja não entra na ficha", f2 ? (await abrirFicha(t.id, r2.ok ? r2.negociacaoId : "", f2.id))?.veiculo?.veiculoId ?? "nenhum" : "x", "nenhum");

  checa("depois dos 180 dias as fichas são apagadas", [await apagarFichasVencidas(new Date("2027-06-01")) >= 2, await prisma.fichaFinanciamento.count({ where: { tenantId: t.id } })], [true, 0]);

  await prisma.tenant.deleteMany({ where: { id: { in: [t.id, t2.id] } } });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
