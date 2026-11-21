import type { Espelho, DiaEspelho } from "@/lib/calculo";
import { dataCurta } from "@/lib/datas";
import { DIAS_CURTOS } from "@/lib/jornada";
import { horas, NOME_OCORRENCIA, percentual, saldo } from "@/lib/formato";
import { Card, Etiqueta, Indicador } from "@/components/ui";
import { AjustesDia } from "@/components/ajustes-dia";

type PropsEspelho = {
  espelho: Espelho;
  colaboradorId: string;
  editavel?: boolean;
  mostrarFotos?: boolean;
};

/**
 * Espelho de ponto: o mesmo componente na tela do administrador (com ajustes),
 * na do colaborador e na impressão. Os mesmos dados nos dois formatos evitam
 * o colaborador ver um número e o administrador outro.
 *
 * - `tabela`: as 9 colunas lado a lado. Precisa de ~1100 px (e é o da impressão).
 * - `cartoes`: um cartão por dia, do mais recente para o mais antigo. É o do
 *   celular, onde a tabela só mostrava a coluna do dia.
 * - `auto`: cartões até a tela ter largura para a tabela (xl, 1280 px).
 */
export function TabelaEspelho({ formato = "auto", ...props }: PropsEspelho & { formato?: "auto" | "cartoes" | "tabela" }) {
  if (formato === "tabela") return <TabelaDias {...props} />;
  if (formato === "cartoes") return <CartoesDias {...props} />;
  return (
    <>
      <div className="xl:hidden">
        <CartoesDias {...props} />
      </div>
      <div className="hidden xl:block">
        <TabelaDias {...props} />
      </div>
    </>
  );
}

function CartoesDias({ espelho, colaboradorId, editavel = false, mostrarFotos = false }: PropsEspelho) {
  // Dia futuro e fora do contrato não têm o que mostrar no celular: só ocupam rolagem.
  const dias = espelho.dias.filter((d) => d.situacao === "NORMAL" || d.situacao === "HOJE").reverse();
  if (dias.length === 0) return <p className="px-4 py-6 text-sm text-neutral-500">Nenhum dia apurado neste mês.</p>;
  return (
    <ul className="divide-y divide-neutral-200">
      {dias.map((d) => {
        const a = d.apuracao;
        const numeros = a
          ? [
              ["Trabalhado", a.trabalhadoComputadoMin ? horas(a.trabalhadoComputadoMin) : "", ""],
              ["Extra", a.extraMin ? horas(a.extraMin) : "", "text-emerald-700"],
              ["Noturno", a.noturnoReduzidoMin ? horas(a.noturnoReduzidoMin) : "", ""],
              ["Débito", d.situacao === "NORMAL" && a.debitoMin ? horas(a.debitoMin) : "", "text-red-600"],
            ].filter(([, v]) => v)
          : [];
        return (
          <li key={d.data} className={`px-4 py-3 space-y-2 ${d.tipoDia !== "UTIL" ? "bg-neutral-50" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p>
                  <span className="font-medium tabular-nums text-neutral-900">{dataCurta(d.data)}</span>{" "}
                  <span className="text-sm text-neutral-500">{DIAS_CURTOS[d.diaSemana]}</span>
                </p>
                <p className={`text-xs ${d.feriado ? "text-accent" : "text-neutral-500"}`}>
                  {d.feriado ? `Feriado: ${d.feriado}` : `Previsto: ${d.previstoTexto}`}
                </p>
              </div>
              {editavel && <AjustesDia colaboradorId={colaboradorId} dia={d} />}
            </div>
            {(d.marcacoes.length > 0 || d.abonos.length > 0) && <Marcacoes dia={d} mostrarFotos={mostrarFotos} />}
            {(numeros.length > 0 || d.situacao === "HOJE" || (a && a.ocorrencias.some((o) => o !== "HORA_EXTRA"))) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {numeros.map(([rotulo, valor, cor]) => (
                  <span key={rotulo} className="text-neutral-500">
                    {rotulo} <span className={`tabular-nums font-medium text-neutral-800 ${cor}`}>{valor}</span>
                  </span>
                ))}
                {d.situacao === "HOJE" && <Etiqueta tom="azul">em andamento</Etiqueta>}
                {a &&
                  d.situacao === "NORMAL" &&
                  a.ocorrencias
                    .filter((o) => o !== "HORA_EXTRA")
                    .map((o) => (
                      <Etiqueta key={o} tom={o === "FALTA" || o === "MARCACAO_IMPAR" ? "vermelho" : "amarelo"}>
                        {NOME_OCORRENCIA[o] ?? o}
                      </Etiqueta>
                    ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TabelaDias({ espelho, colaboradorId, editavel = false, mostrarFotos = false }: PropsEspelho) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="px-3 py-2.5 font-medium">Dia</th>
            <th className="px-3 py-2.5 font-medium">Previsto</th>
            <th className="px-3 py-2.5 font-medium">Marcações</th>
            <th className="px-3 py-2.5 font-medium text-right">Trabalhado</th>
            <th className="px-3 py-2.5 font-medium text-right">Extra</th>
            <th className="px-3 py-2.5 font-medium text-right">Noturno</th>
            <th className="px-3 py-2.5 font-medium text-right">Débito</th>
            <th className="px-3 py-2.5 font-medium">Ocorrências</th>
            {editavel && <th className="px-3 py-2.5 nao-imprimir" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {espelho.dias.map((d) => (
            <LinhaDia key={d.data} dia={d} colaboradorId={colaboradorId} editavel={editavel} mostrarFotos={mostrarFotos} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaDia({
  dia: d,
  colaboradorId,
  editavel,
  mostrarFotos,
}: {
  dia: DiaEspelho;
  colaboradorId: string;
  editavel: boolean;
  mostrarFotos: boolean;
}) {
  const a = d.apuracao;
  const apagado = d.situacao === "FUTURO" || d.situacao === "FORA_DO_CONTRATO";
  const fimDeSemana = d.tipoDia !== "UTIL";

  return (
    <tr className={`${apagado ? "text-neutral-400" : "text-neutral-800"} ${fimDeSemana ? "bg-neutral-50" : ""} align-top`}>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="tabular-nums font-medium">{dataCurta(d.data)}</span>{" "}
        <span className="text-neutral-500">{DIAS_CURTOS[d.diaSemana]}</span>
        {d.feriado && <p className="text-xs text-accent">{d.feriado}</p>}
      </td>
      <td className="px-3 py-2 text-xs text-neutral-500 whitespace-nowrap">{d.feriado ? "feriado" : d.previstoTexto}</td>
      <td className="px-3 py-2 min-w-[15rem]">
        <Marcacoes dia={d} mostrarFotos={mostrarFotos} />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{a ? horas(a.trabalhadoComputadoMin) : ""}</td>
      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{a ? horas(a.extraMin) : ""}</td>
      <td className="px-3 py-2 text-right tabular-nums">{a ? horas(a.noturnoReduzidoMin) : ""}</td>
      <td className="px-3 py-2 text-right tabular-nums text-red-600">{a && d.situacao === "NORMAL" ? horas(a.debitoMin) : ""}</td>
      <td className="px-3 py-2 min-w-[9rem]">
        <div className="flex flex-wrap gap-1">
          {d.situacao === "HOJE" && <Etiqueta tom="azul">em andamento</Etiqueta>}
          {a &&
            d.situacao === "NORMAL" &&
            a.ocorrencias
              .filter((o) => o !== "HORA_EXTRA")
              .map((o) => (
                <Etiqueta key={o} tom={o === "FALTA" || o === "MARCACAO_IMPAR" ? "vermelho" : "amarelo"}>
                  {NOME_OCORRENCIA[o] ?? o}
                </Etiqueta>
              ))}
        </div>
      </td>
      {editavel && (
        <td className="px-3 py-2 nao-imprimir">
          {d.situacao !== "FUTURO" && d.situacao !== "FORA_DO_CONTRATO" && (
            <AjustesDia colaboradorId={colaboradorId} dia={d} />
          )}
        </td>
      )}
    </tr>
  );
}

export function ResumoEspelho({ espelho }: { espelho: Espelho }) {
  const t = espelho.totais;
  // Duração das jornadas com a hora noturna reduzida (Portaria 671, art. 84, VI).
  const trabalhado = espelho.dias.reduce((s, d) => s + (d.situacao === "NORMAL" && d.apuracao ? d.apuracao.trabalhadoComputadoMin : 0), 0);
  const saldoDoMes = t.lancamentosBanco.reduce((s, l) => s + l.minutos, 0);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Indicador rotulo="Trabalhado" valor={horas(trabalhado, false)} detalhe={`previsto ${horas(t.previstoMin, false)}`} />
      {espelho.banco ? (
        <Indicador
          rotulo="Banco de horas"
          valor={saldo(espelho.banco.saldoMin)}
          detalhe={`no mês: ${saldo(saldoDoMes)}`}
          tom={espelho.banco.saldoMin < 0 ? "vermelho" : espelho.banco.saldoMin > 0 ? "verde" : "neutro"}
        />
      ) : (
        <Indicador rotulo="Débito a descontar" valor={horas(t.debitoADescontarMin, false)} tom={t.debitoADescontarMin ? "vermelho" : "neutro"} />
      )}
      <Indicador
        rotulo="Extras a pagar"
        valor={horas(t.extrasAPagar.reduce((s, e) => s + e.minutos, 0), false)}
        detalhe={t.extrasAPagar.map((e) => `${horas(e.minutos)} a ${percentual(e.percentualBp)}`).join(" · ") || undefined}
      />
      <Indicador rotulo="Faltas" valor={String(t.faltas)} detalhe={`atrasos ${horas(t.atrasoMin, false)}`} tom={t.faltas ? "vermelho" : "neutro"} />
      <Indicador rotulo="Adicional noturno" valor={horas(t.noturnoReduzidoMin, false)} detalhe="horas noturnas (reduzidas)" />
      <Indicador rotulo="Abonado" valor={horas(t.abonoMin, false)} />
      <Indicador rotulo="Intervalo não gozado" valor={horas(t.intervaloSuprimidoMin, false)} tom={t.intervaloSuprimidoMin ? "vermelho" : "neutro"} />
      <Indicador
        rotulo="Dias para corrigir"
        valor={String(t.diasIncompletos.length)}
        detalhe="marcação ímpar"
        tom={t.diasIncompletos.length ? "vermelho" : "neutro"}
      />
    </div>
  );
}

export function LegendaEspelho() {
  return (
    <Card className="p-3 text-xs text-neutral-500 flex flex-wrap gap-x-5 gap-y-1">
      <span>
        <span className="italic text-accent">08:00*</span> incluída por ajuste
      </span>
      <span>
        <span className="line-through">08:00</span> desconsiderada
      </span>
      <span>
        <span className="rounded bg-amber-500/10 px-1">08:00</span> para conferir (sem localização, sem foto ou sem internet)
      </span>
      <span>
        <sup>+1</sup> dia seguinte
      </span>
      <span>Trabalhado e noturno já com a hora noturna reduzida (52min30s = 1h). Hoje entra no total quando o dia terminar.</span>
    </Card>
  );
}

/** Marcações e abonos do dia, com as marcas de incluída, desconsiderada e para conferir. */
function Marcacoes({ dia, mostrarFotos }: { dia: DiaEspelho; mostrarFotos: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {dia.marcacoes.map((m) => (
        <span
          key={m.id}
          title={
            m.desconsiderada
              ? `Desconsiderada por ${m.desconsiderada.autor}: ${m.desconsiderada.motivo}`
              : m.origem === "INCLUSAO"
                ? `Incluída por ${m.autorInclusao}: ${m.motivoInclusao}`
                : `NSR ${m.nsr}${m.revisar ? ` · revisar: ${m.revisar}` : ""}`
          }
          className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 tabular-nums text-xs border ${
            m.desconsiderada
              ? "line-through text-neutral-400 border-neutral-200"
              : m.origem === "INCLUSAO"
                ? "italic border-dashed border-accent/50 text-accent"
                : m.revisar
                  ? "border-amber-500/40 bg-amber-500/10"
                  : "border-neutral-200"
          }`}
        >
          {m.hora}
          {m.diaSeguinte && <sup className="text-[9px]">+1</sup>}
          {m.origem === "INCLUSAO" && "*"}
          {mostrarFotos && m.temFoto && (
            <a href={`/api/marcacoes/${m.id}/foto`} target="_blank" rel="noreferrer" className="nao-imprimir" title="Ver foto">
              📷
            </a>
          )}
        </span>
      ))}
      {dia.abonos.map((ab) => (
        <span key={ab.id} title={`${ab.motivo} (${ab.autor})`} className="rounded px-1.5 py-0.5 text-xs bg-emerald-500/10 text-emerald-700">
          abono {horas(ab.minutos)}
        </span>
      ))}
      {dia.situacao === "FORA_DO_CONTRATO" && <span className="text-xs">{dia.motivoFora}</span>}
    </div>
  );
}
