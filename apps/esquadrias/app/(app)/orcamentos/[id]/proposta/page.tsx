import { notFound } from "next/navigation";
import Link from "next/link";
import { formatarM2, formatarReais } from "@dilon-zap/esquadrias-core";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { expansoesDoOrcamento } from "@/lib/calculo";
import { requireUsuario } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Proposta comercial — o documento que sai da empresa.
 *
 * Sai com a marca da SERRALHERIA, não com a nossa: é a peça que o cliente
 * final guarda, e é ela que faz a assinatura se pagar na cabeça de quem
 * vende. Nenhum custo, margem ou memória de cálculo aparece aqui.
 */
export default async function PropostaPage({ params }: { params: { id: string } }) {
  const usuario = await requireUsuario();
  const dados = await expansoesDoOrcamento(params.id, usuario.empresaId);
  if (!dados) notFound();

  const { orcamento, itens } = dados;
  const empresa = orcamento.empresa;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between nao-imprimir">
        <Link href={`/orcamentos/${params.id}`} className="text-sm text-accent hover:underline">
          ← voltar ao orçamento
        </Link>
        <BotaoImprimir rotulo="Imprimir / salvar PDF" />
      </div>

      <article className="rounded-xl border border-neutral-200 bg-surface p-8 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-5">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">{empresa.nome}</h1>
            <p className="mt-1 text-sm text-neutral-600">
              {[empresa.endereco, empresa.cidade, empresa.uf].filter(Boolean).join(" · ")}
            </p>
            <p className="text-sm text-neutral-600">
              {[empresa.telefone, empresa.email, empresa.cnpj ? `CNPJ ${empresa.cnpj}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {empresa.logoUrl ? <img src={empresa.logoUrl} alt={empresa.nome} className="h-14 w-auto object-contain" /> : null}
        </header>

        <section className="grid gap-4 border-b border-neutral-200 py-5 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Proposta</p>
            <p className="text-neutral-900">
              Nº {orcamento.numero} · {new Date(orcamento.criadoEm).toLocaleDateString("pt-BR")}
            </p>
            {orcamento.validoAte && (
              <p className="text-sm text-neutral-600">Válida até {new Date(orcamento.validoAte).toLocaleDateString("pt-BR")}</p>
            )}
            {orcamento.vendedor && <p className="text-sm text-neutral-600">Vendedor: {orcamento.vendedor.nome}</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Cliente</p>
            <p className="text-neutral-900">{orcamento.cliente?.nome ?? "—"}</p>
            {orcamento.cliente && (
              <p className="text-sm text-neutral-600">
                {[orcamento.cliente.telefone, orcamento.cliente.cidade, orcamento.cliente.uf].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </section>

        <section className="py-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 font-medium">Medidas</th>
                <th className="py-2 font-medium">Qtd</th>
                <th className="py-2 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {itens.map(({ item, memoria }, i) => (
                <tr key={item.id}>
                  <td className="py-3 align-top">
                    <p className="font-medium text-neutral-900">
                      {i + 1}. {item.descricao}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {[item.ambiente, item.corAluminio ? `cor ${item.corAluminio.nome}` : null].filter(Boolean).join(" · ")}
                    </p>
                    {memoria && (
                      <p className="text-xs text-neutral-500">
                        {memoria.expansao.vidros.map((v) => v.vidroNome).join(", ")} · {formatarM2(memoria.expansao.areaTotalM2)}
                      </p>
                    )}
                    {item.observacoes && <p className="mt-1 text-xs text-neutral-600">{item.observacoes}</p>}
                  </td>
                  <td className="py-3 align-top text-neutral-700">
                    {item.larguraMm} × {item.alturaMm} mm
                  </td>
                  <td className="py-3 align-top text-neutral-700">{item.quantidade}</td>
                  <td className="py-3 align-top text-right text-neutral-900">{formatarReais(item.totalCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="border-t border-neutral-200 py-5">
          <dl className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-600">Subtotal</dt>
              <dd className="text-neutral-900">{formatarReais(orcamento.subtotalCentavos)}</dd>
            </div>
            {orcamento.descontoAplicadoCentavos > 0 && (
              <div className="flex justify-between">
                <dt className="text-neutral-600">Desconto</dt>
                <dd className="text-neutral-900">− {formatarReais(orcamento.descontoAplicadoCentavos)}</dd>
              </div>
            )}
            {orcamento.freteCentavos > 0 && (
              <div className="flex justify-between">
                <dt className="text-neutral-600">Frete / instalação</dt>
                <dd className="text-neutral-900">{formatarReais(orcamento.freteCentavos)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-neutral-200 pt-1 text-base font-semibold">
              <dt className="text-neutral-900">Total</dt>
              <dd className="text-neutral-900">{formatarReais(orcamento.totalCentavos)}</dd>
            </div>
          </dl>
        </section>

        {(orcamento.condicoes || orcamento.observacoes) && (
          <section className="border-t border-neutral-200 pt-5 text-sm text-neutral-700">
            {orcamento.condicoes && (
              <>
                <h2 className="mb-1 font-medium text-neutral-900">Condições</h2>
                <p className="whitespace-pre-line">{orcamento.condicoes}</p>
              </>
            )}
            {orcamento.observacoes && <p className="mt-3 whitespace-pre-line">{orcamento.observacoes}</p>}
          </section>
        )}

        <section className="mt-10 grid gap-10 pt-6 sm:grid-cols-2">
          {[empresa.nome, orcamento.cliente?.nome ?? "Cliente"].map((assinante, i) => (
            <div key={i} className="text-center">
              <div className="mx-auto mb-1 border-t border-neutral-400 pt-1" />
              <p className="text-sm text-neutral-700">{assinante}</p>
            </div>
          ))}
        </section>
      </article>
    </div>
  );
}
