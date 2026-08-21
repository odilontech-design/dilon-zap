import Link from "next/link";
import { NOME_PLANO, planoMinimo, type Recurso } from "@/lib/planos";
import { requireUsuario } from "@/lib/session";

const DESCRICAO: Partial<Record<Recurso, string>> = {
  FINANCEIRO: "Fluxo de caixa, contas a receber e a pagar ligadas às obras.",
  AGENDA: "Medições, instalações e entregas em uma agenda por responsável.",
  RELATORIOS: "Conversão de orçamentos, faturamento por período e ranking de vendedores.",
  METAS: "Meta mensal por vendedor e acompanhamento do atingimento.",
  PLANO_CORTE: "Otimização das barras de 6 metros, com aproveitamento e retalho reaproveitável.",
  ETIQUETAS: "Etiquetas de corte e de produto para a bancada.",
  CHECKLIST_PRODUCAO: "Checklist de produção por obra.",
  ORDEM_SERVICO: "Ordem de serviço para a equipe de instalação.",
  API_PUBLICA: "Integração com o seu site e com outros sistemas.",
};

export default async function UpgradePage({ searchParams }: { searchParams: { recurso?: string } }) {
  const usuario = await requireUsuario();
  const recurso = searchParams.recurso as Recurso | undefined;
  const necessario = recurso ? planoMinimo(recurso) : "ESSENCIAL";

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-5 h-12 w-12 rounded-xl bg-accent/10 text-accent grid place-items-center text-xl">🔒</div>
        <h1 className="text-2xl font-semibold text-neutral-900">Disponível no plano {NOME_PLANO[necessario]}</h1>
        <p className="mt-2 text-neutral-600">
          {recurso && DESCRICAO[recurso] ? DESCRICAO[recurso] : "Este recurso faz parte de um plano superior."}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Sua empresa está no plano <strong>{NOME_PLANO[usuario.plano]}</strong>.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/painel" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
            Voltar
          </Link>
          <Link href="/configuracoes/plano" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Ver planos
          </Link>
        </div>
      </div>
    </main>
  );
}
