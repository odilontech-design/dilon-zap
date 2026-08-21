import Link from "next/link";
import { prisma } from "@dilon-zap/erp-db";
import { Card, Etiqueta, TituloPagina } from "@/components/ui";
import { requireDono } from "@/lib/session";
import { LIMITE_USUARIOS, NOME_PLANO } from "@/lib/planos";

export const dynamic = "force-dynamic";

/**
 * Comparativo de planos.
 *
 * O corte espelha o que o mercado já pratica — é o que a serralheria
 * reconhece ao comparar. A diferença deliberada está no BÁSICO: tipologia
 * paramétrica e relação de materiais entram desde o primeiro plano, porque
 * sem elas o orçamento vira digitação manual e cobrar por isso é cobrar pelo
 * que o Excel faz de graça.
 */
const PLANOS = [
  {
    plano: "BASICO" as const,
    preco: "R$ 89,90",
    destaque: false,
    itens: [
      "Orçamento com tipologia paramétrica",
      "Relação de materiais",
      "Cadastro de clientes e obras",
      "Catálogo de perfis, vidros e ferragens",
      "Proposta e contrato para impressão",
      "Até 3 usuários",
    ],
  },
  {
    plano: "ESSENCIAL" as const,
    preco: "R$ 149,90",
    destaque: true,
    itens: [
      "Tudo do Básico, mais:",
      "Financeiro (contas a receber e a pagar)",
      "Agenda de medição e instalação",
      "Relatórios de conversão e faturamento",
      "Metas e ranking de vendedores",
      "Usuários ilimitados",
    ],
  },
  {
    plano: "AVANCADO" as const,
    preco: "R$ 239,90",
    destaque: false,
    itens: [
      "Tudo do Essencial, mais:",
      "Plano de corte com otimização de barras",
      "Etiquetas de corte e de produto",
      "Checklist de produção",
      "Ordem de serviço",
      "API pública para integração",
    ],
  },
];

export default async function PlanoPage() {
  const usuario = await requireDono();
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: usuario.empresaId } });
  const ativos = await prisma.usuario.count({ where: { empresaId: usuario.empresaId, desativadoEm: null, papel: { not: "SUPERADMIN" } } });
  const limite = LIMITE_USUARIOS[empresa.plano];

  return (
    <>
      <TituloPagina
        titulo="Plano e cobrança"
        descricao={`Sua empresa está no plano ${NOME_PLANO[empresa.plano]} · ${ativos} usuário(s) ativo(s)${limite ? ` de ${limite}` : ""}.`}
        acao={
          <Link href="/configuracoes" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
            Voltar
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANOS.map((p) => {
          const atual = p.plano === empresa.plano;
          return (
            <Card key={p.plano} className={`flex flex-col p-5 ${p.destaque ? "ring-2 ring-accent" : ""}`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-neutral-900">{NOME_PLANO[p.plano]}</h2>
                {atual ? <Etiqueta tom="verde">plano atual</Etiqueta> : p.destaque ? <Etiqueta tom="azul">mais indicado</Etiqueta> : null}
              </div>

              <p className="mb-4">
                <span className="text-3xl font-semibold text-neutral-900">{p.preco}</span>
                <span className="text-sm text-neutral-500">/mês</span>
              </p>

              <ul className="flex-1 space-y-2 text-sm">
                {p.itens.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-accent">✓</span>
                    <span className="text-neutral-700">{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4 p-4 text-sm text-neutral-600">
        A troca de plano ainda é feita pelo suporte — o fluxo de pagamento entra na próxima etapa. Assim que o plano muda no
        cadastro, os recursos liberam na sessão seguinte.
      </Card>
    </>
  );
}
