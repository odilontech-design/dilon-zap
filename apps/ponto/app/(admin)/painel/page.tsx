import Link from "next/link";
import { prisma } from "@dilon-zap/ponto-db";
import { minutoLocal } from "@dilon-zap/ponto-core";
import { requireAdmin } from "@/lib/session";
import { apurarIntervalo, SELECAO_EMPRESA_CALCULO } from "@/lib/calculo";
import { hojeNoFuso, somarDias } from "@/lib/datas";
import { previstoDoDia, type Semana } from "@/lib/jornada";
import { PLANOS } from "@/lib/planos";
import { horas } from "@/lib/formato";
import { BotaoLink, Card, Etiqueta, Indicador, TituloPagina, type Tom } from "@/components/ui";

export const dynamic = "force-dynamic";

type Status = { rotulo: string; tom: Tom; ordem: number };

export default async function Painel() {
  const u = await requireAdmin();
  const fuso = u.empresa.timezone;
  const hoje = hojeNoFuso(fuso);
  const agora = minutoLocal(new Date(), hoje, fuso);

  const [empresa, colaboradores, jornadas, totalMarcacoes, paraRevisar] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: u.empresaId }, select: SELECAO_EMPRESA_CALCULO }),
    prisma.colaborador.findMany({
      where: { empresaId: u.empresaId, ativo: true },
      orderBy: { nome: "asc" },
      include: { jornada: { select: { semana: true } }, usuario: { select: { trocarSenha: true } } },
    }),
    prisma.jornada.count({ where: { empresaId: u.empresaId } }),
    prisma.marcacao.count({ where: { empresaId: u.empresaId } }),
    prisma.marcacao.count({
      where: { empresaId: u.empresaId, revisar: { not: null }, instante: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    }),
  ]);

  const situacoes = await Promise.all(
    colaboradores.map(async (c) => {
      const [dia] = await apurarIntervalo(empresa, c, hoje, hoje);
      const previsto = previstoDoDia(c.jornada.semana as unknown as Semana, dia.diaSemana);
      const efetivas = dia.marcacoes.filter((m) => !m.desconsiderada);
      const tolerancia = empresa.toleranciaPorMarcacaoMin;
      let status: Status;
      if (dia.feriado || previsto.length === 0) {
        status = efetivas.length % 2 === 1 ? { rotulo: "Trabalhando (folga)", tom: "azul", ordem: 1 } : { rotulo: "Folga", tom: "neutro", ordem: 5 };
      } else if (efetivas.length === 0) {
        status =
          agora > previsto[0].inicio + tolerancia
            ? { rotulo: "Não registrou entrada", tom: "vermelho", ordem: 0 }
            : { rotulo: `Entra às ${dia.previstoTexto.split("–")[0]}`, tom: "neutro", ordem: 4 };
      } else if (efetivas.length % 2 === 1) {
        status = { rotulo: "Trabalhando", tom: "verde", ordem: 2 };
      } else if (efetivas.length < previsto.length * 2 && agora < previsto[previsto.length - 1].fim) {
        status = { rotulo: "Em intervalo", tom: "amarelo", ordem: 3 };
      } else {
        status = { rotulo: "Encerrou o dia", tom: "neutro", ordem: 6 };
      }
      return { c, dia, efetivas, status };
    }),
  );
  situacoes.sort((a, b) => a.status.ordem - b.status.ordem || a.c.nome.localeCompare(b.c.nome));

  const plano = PLANOS[u.empresa.plano];
  const trabalhando = situacoes.filter((s) => s.status.rotulo.startsWith("Trabalhando")).length;
  const semEntrada = situacoes.filter((s) => s.status.tom === "vermelho").length;
  const naoAcessaram = colaboradores.filter((c) => c.usuario?.trocarSenha).length;

  const passos = [
    { feito: jornadas > 0, texto: "Cadastrar a jornada (horário de trabalho)", href: "/jornadas" },
    { feito: colaboradores.length > 0, texto: "Cadastrar os colaboradores e enviar o passo a passo de acesso", href: "/colaboradores" },
    { feito: colaboradores.length > 0 && naoAcessaram < colaboradores.length, texto: "Colaborador entrar e criar a senha", href: "/colaboradores" },
    { feito: totalMarcacoes > 0, texto: "Primeira marcação de ponto", href: "/ponto" },
  ];
  const implantado = passos.every((p) => p.feito);

  return (
    <>
      <TituloPagina titulo="Início" descricao={`Hoje, ${hoje.split("-").reverse().join("/")}`} />

      {!implantado && (
        <Card className="p-5 mb-6">
          <p className="font-semibold text-neutral-900">Passo a passo para começar</p>
          <ol className="mt-3 space-y-2 text-sm">
            {passos.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`grid h-5 w-5 place-items-center rounded-full text-xs ${p.feito ? "bg-emerald-500 text-white" : "border border-neutral-300 text-neutral-500"}`}>
                  {p.feito ? "✓" : i + 1}
                </span>
                {p.feito ? (
                  <span className="text-neutral-500 line-through">{p.texto}</span>
                ) : (
                  <Link href={p.href} className="text-accent">
                    {p.texto}
                  </Link>
                )}
              </li>
            ))}
          </ol>
          <p className="text-xs text-neutral-500 mt-3">O treinamento ao vivo está incluído no plano. Fale com o suporte para agendar.</p>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Indicador rotulo="Trabalhando agora" valor={String(trabalhando)} tom={trabalhando ? "verde" : "neutro"} />
        <Indicador rotulo="Sem entrada hoje" valor={String(semEntrada)} detalhe="já passou do horário" tom={semEntrada ? "vermelho" : "neutro"} />
        <Indicador rotulo="Para conferir" valor={String(paraRevisar)} detalhe="marcações nos últimos 7 dias" />
        <Indicador
          rotulo={`Plano ${plano.nome}`}
          valor={`${colaboradores.length}${plano.maxColaboradores ? `/${plano.maxColaboradores}` : ""}`}
          detalhe={`colaboradores · ${jornadas}${plano.maxJornadas ? `/${plano.maxJornadas}` : ""} jornadas`}
        />
      </div>

      <Card>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <p className="font-medium text-neutral-900">Equipe hoje</p>
          <BotaoLink href="/ponto" variante="secundario">
            Controle de ponto
          </BotaoLink>
        </div>
        {situacoes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">Nenhum colaborador ativo.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {situacoes.map(({ c, dia, efetivas, status }) => (
              <li key={c.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                <Link href={`/ponto?colaborador=${c.id}`} className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900">{c.nome}</p>
                  <p className="text-xs text-neutral-500">
                    {dia.feriado ? `Feriado: ${dia.feriado}` : `Previsto: ${dia.previstoTexto}`}
                    {dia.apuracao && dia.apuracao.trabalhadoMin > 0 && ` · trabalhado ${horas(dia.apuracao.trabalhadoMin)}`}
                  </p>
                </Link>
                <div className="flex gap-1 text-xs tabular-nums text-neutral-600">
                  {efetivas.map((m) => (
                    <span key={m.id} className="rounded border border-neutral-200 px-1.5 py-0.5">
                      {m.hora}
                    </span>
                  ))}
                </div>
                <Etiqueta tom={status.tom}>{status.rotulo}</Etiqueta>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-neutral-500 mt-3">
        Turnos que começaram ontem à noite aparecem no dia {somarDias(hoje, -1).split("-").reverse().join("/")} do controle de ponto.
      </p>
    </>
  );
}
