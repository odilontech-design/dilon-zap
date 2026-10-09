/**
 * Monta os dois funis da proposta para a Believe, a partir do funil único que
 * ela já tem (migrado dos contatos):
 *
 *   Vendas:   Novo contato → Em conversa → Orçamento enviado → Pedido no financeiro
 *   Pós-venda e recompra: Em separação → Enviado → Entrega recebida → Recompra
 *
 * As etapas "Em separação" e "Entrega recebida" NÃO são recriadas: o registro
 * da etapa muda de funil, então as negociações que estão nelas vão junto, com o
 * histórico intacto (o histórico aponta para o id da etapa, que não muda).
 *
 * Idempotente: se o funil de Pós-venda já existe, não faz nada.
 *
 * Uso (dentro do container, pelo stdin — ver reference_dilon_zap_vps):
 *   npx tsx scripts/_montar.ts "Believe Cosméticos"          (simulação)
 *   npx tsx scripts/_montar.ts "Believe Cosméticos" --gravar
 */
import { prisma } from "@dilon-zap/db";

const NOME_VENDAS = "Vendas";
const NOME_POS = "Pós-venda e recompra";

async function main() {
  const nome = process.argv[2];
  const gravar = process.argv.includes("--gravar");
  if (!nome) throw new Error("informe o nome da empresa");
  console.log(gravar ? "GRAVANDO" : "SIMULAÇÃO (use --gravar para aplicar)");

  const tenant = await prisma.tenant.findFirstOrThrow({ where: { name: { startsWith: nome } } });
  const vendas = await prisma.funil.findFirstOrThrow({ where: { tenantId: tenant.id, padrao: true, arquivadoEm: null } });

  const jaExiste = await prisma.funil.findUnique({ where: { tenantId_nome: { tenantId: tenant.id, nome: NOME_POS } } });
  if (jaExiste) {
    console.log(`O funil "${NOME_POS}" já existe. Nada a fazer.`);
    return;
  }

  const etapas = await prisma.stage.findMany({ where: { funilId: vendas.id }, orderBy: { position: "asc" } });
  const porNome = new Map(etapas.map((e) => [e.name, e]));
  const esperadas = ["(1) Primeiro contato", "(2) Orçamento enviado", "(3) Em separação", "(4) Entrega recebida", "(5) Financeiro"];
  const faltam = esperadas.filter((n) => !porNome.has(n));
  if (faltam.length) throw new Error(`Etapas inesperadas; faltam: ${faltam.join(", ")}. O funil foi alterado à mão — nada foi feito.`);

  const contagem = async (id: string) => prisma.negociacao.count({ where: { stageId: id } });
  console.log(`Funil atual: "${vendas.nome}" com ${etapas.length} etapas`);
  for (const e of etapas) console.log(`  ${e.position} ${e.name}: ${await contagem(e.id)} negociação(ões)`);
  console.log(`Plano: renomear o funil para "${NOME_VENDAS}"; criar "Em conversa"; mover "Em separação" e "Entrega recebida" para "${NOME_POS}" (+ Enviado e Recompra).`);

  if (!gravar) return;

  await prisma.$transaction(async (tx) => {
    // 1. Vendas: renomeia o funil e as etapas, e abre "Em conversa" na posição 1.
    await tx.funil.update({ where: { id: vendas.id }, data: { nome: NOME_VENDAS } });

    const primeiro = porNome.get("(1) Primeiro contato")!;
    const orcamento = porNome.get("(2) Orçamento enviado")!;
    const financeiro = porNome.get("(5) Financeiro")!;
    const separacao = porNome.get("(3) Em separação")!;
    const entrega = porNome.get("(4) Entrega recebida")!;

    // As etapas que saem do funil vão primeiro, para o nome "Enviado"/etc. não colidir
    // e para as posições de Vendas ficarem livres.
    const pos = await tx.funil.create({
      data: { tenantId: tenant.id, nome: NOME_POS, position: vendas.position + 1 },
    });
    await tx.stage.update({ where: { id: separacao.id }, data: { funilId: pos.id, name: "Em separação", position: 0, probabilidade: 0 } });
    await tx.stage.update({ where: { id: entrega.id }, data: { funilId: pos.id, name: "Entrega recebida", position: 2, probabilidade: 0 } });
    await tx.stage.createMany({
      data: [
        { tenantId: tenant.id, funilId: pos.id, name: "Enviado", color: "#8B5CF6", position: 1, probabilidade: 0 },
        { tenantId: tenant.id, funilId: pos.id, name: "Recompra", color: "#16A34A", position: 3, probabilidade: 0 },
      ],
    });

    // Negociações que estavam nessas duas etapas passam a ser do funil novo.
    await tx.negociacao.updateMany({ where: { stageId: { in: [separacao.id, entrega.id] } }, data: { funilId: pos.id } });

    await tx.stage.update({ where: { id: primeiro.id }, data: { name: "Novo contato", position: 0, probabilidade: 10 } });
    await tx.stage.create({
      data: { tenantId: tenant.id, funilId: vendas.id, name: "Em conversa", color: "#0EA5E9", position: 1, probabilidade: 25 },
    });
    await tx.stage.update({ where: { id: orcamento.id }, data: { name: "Orçamento enviado", position: 2, probabilidade: 50 } });
    await tx.stage.update({ where: { id: financeiro.id }, data: { name: "Pedido no financeiro", position: 3, probabilidade: 80 } });
  });

  const novos = await prisma.funil.findMany({ where: { tenantId: tenant.id, arquivadoEm: null }, orderBy: { position: "asc" } });
  for (const f of novos) {
    const es = await prisma.stage.findMany({ where: { funilId: f.id }, orderBy: { position: "asc" } });
    console.log(`\n${f.nome}${f.padrao ? " (padrão)" : ""}`);
    for (const e of es) console.log(`  ${e.position} ${e.name} · ${e.probabilidade}% · ${await contagem(e.id)} negociação(ões)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
