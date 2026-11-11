import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { validarMes } from "@/lib/datas";
import { gerarRelatorio, RELATORIOS, type TipoRelatorio } from "@/lib/relatorios";
import { BotaoLink, Card, Tabela, TituloPagina, Vazio } from "@/components/ui";
import { NavegacaoMes } from "@/components/navegacao-mes";

export const dynamic = "force-dynamic";

export default async function PaginaRelatorios({ searchParams }: { searchParams: { tipo?: string; mes?: string } }) {
  const u = await requireAdmin();
  const mes = validarMes(searchParams.mes, u.empresa.timezone);
  const tipo = (searchParams.tipo && searchParams.tipo in RELATORIOS ? searchParams.tipo : "resumo") as TipoRelatorio;
  const r = await gerarRelatorio(tipo, u.empresaId, mes);

  return (
    <>
      <TituloPagina
        titulo="Relatórios"
        descricao={RELATORIOS[tipo].descricao}
        acao={<BotaoLink href={`/api/relatorios/${tipo}?mes=${mes}`} variante="secundario">Baixar planilha (CSV)</BotaoLink>}
      />
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(RELATORIOS) as TipoRelatorio[]).map((t) => (
            <Link
              key={t}
              href={`/relatorios?tipo=${t}&mes=${mes}`}
              className={`rounded-full border px-3 py-1 text-sm ${t === tipo ? "border-accent bg-accent/10 text-accent font-medium" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}
            >
              {RELATORIOS[t].titulo}
            </Link>
          ))}
        </div>
        <div className="ml-auto">
          <NavegacaoMes mes={mes} href={(m) => `/relatorios?tipo=${tipo}&mes=${m}`} />
        </div>
      </div>
      <Card>
        {r.linhas.length === 0 ? (
          <Vazio titulo="Nada neste mês" />
        ) : (
          <Tabela cabecalho={r.colunas}>
            {r.linhas.map((l, i) => (
              <tr key={i} className="text-neutral-800">
                {l.map((c, j) => (
                  <td key={j} className={`px-4 py-2 ${j === 0 ? "" : "tabular-nums"} whitespace-nowrap`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </Tabela>
        )}
      </Card>
    </>
  );
}
