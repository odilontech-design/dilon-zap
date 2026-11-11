import type { Espelho, DiaEspelho } from "@/lib/calculo";
import { dataCurta } from "@/lib/datas";
import { DIAS_CURTOS } from "@/lib/jornada";
import { horas, NOME_OCORRENCIA, percentual, saldo } from "@/lib/formato";
import { Card, Etiqueta, Indicador } from "@/components/ui";
import { AjustesDia } from "@/components/ajustes-dia";

/**
 * Espelho de ponto: o mesmo componente na tela do administrador (com ajustes),
 * na do colaborador e na impressão. Uma tabela só evita o colaborador ver um
 * número e o administrador outro.
 */
export function TabelaEspelho({
  espelho,
  colaboradorId,
  editavel = false,
  mostrarFotos = false,
}: {
  espelho: Espelho;
  colaboradorId: string;
  editavel?: boolean;
  mostrarFotos?: boolean;
}) {
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
        <div className="flex flex-wrap gap-1">
          {d.marcacoes.map((m) => (
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
          {d.abonos.map((ab) => (
            <span key={ab.id} title={`${ab.motivo} (${ab.autor})`} className="rounded px-1.5 py-0.5 text-xs bg-emerald-500/10 text-emerald-700">
              abono {horas(ab.minutos)}
            </span>
          ))}
          {d.situacao === "FORA_DO_CONTRATO" && <span className="text-xs">{d.motivoFora}</span>}
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{a ? horas(a.trabalhadoMin) : ""}</td>
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
  const saldoDoMes = t.lancamentosBanco.reduce((s, l) => s + l.minutos, 0);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Indicador rotulo="Trabalhado" valor={horas(t.trabalhadoMin, false)} detalhe={`previsto ${horas(t.previstoMin, false)}`} />
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
      <span>Noturno em horas reduzidas (52min30s = 1h). Hoje entra no total quando o dia terminar.</span>
    </Card>
  );
}
