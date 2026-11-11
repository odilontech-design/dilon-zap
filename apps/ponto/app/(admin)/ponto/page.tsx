import Link from "next/link";
import { prisma } from "@dilon-zap/ponto-db";
import { requireAdmin } from "@/lib/session";
import { espelhoDoMes, SELECAO_EMPRESA_CALCULO } from "@/lib/calculo";
import { validarMes } from "@/lib/datas";
import { formatarCpf } from "@/lib/documentos";
import { BotaoLink, Card, TituloPagina, Vazio } from "@/components/ui";
import { NavegacaoMes } from "@/components/navegacao-mes";
import { LegendaEspelho, ResumoEspelho, TabelaEspelho } from "@/components/espelho";

export const dynamic = "force-dynamic";

export default async function ControlePonto({ searchParams }: { searchParams: { colaborador?: string; mes?: string } }) {
  const u = await requireAdmin();
  const mes = validarMes(searchParams.mes, u.empresa.timezone);

  const [empresa, colaboradores] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: u.empresaId }, select: SELECAO_EMPRESA_CALCULO }),
    prisma.colaborador.findMany({
      where: { empresaId: u.empresaId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      include: { jornada: { select: { semana: true, nome: true } } },
    }),
  ]);

  if (colaboradores.length === 0) {
    return (
      <>
        <TituloPagina titulo="Controle de ponto" />
        <Card>
          <Vazio
            titulo="Nenhum colaborador cadastrado"
            descricao="Cadastre uma jornada e os colaboradores para começar a acompanhar o ponto."
            acao={<BotaoLink href="/colaboradores">Cadastrar colaboradores</BotaoLink>}
          />
        </Card>
      </>
    );
  }

  const atual = colaboradores.find((c) => c.id === searchParams.colaborador) ?? colaboradores[0];
  const espelho = await espelhoDoMes(empresa, atual, mes);
  const link = (m: string, c = atual.id) => `/ponto?colaborador=${c}&mes=${m}`;

  return (
    <>
      <TituloPagina
        titulo="Controle de ponto"
        descricao="Confira as marcações, inclua o que faltou e desconsidere o que não vale. Todo ajuste pede motivo e a marcação original continua registrada."
        acao={<BotaoLink href={`/espelho/${atual.id}?mes=${mes}`} variante="secundario">Imprimir espelho</BotaoLink>}
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-1.5">
          {colaboradores.map((c) => (
            <Link
              key={c.id}
              href={link(mes, c.id)}
              className={`rounded-full border px-3 py-1 text-sm ${
                c.id === atual.id ? "border-accent bg-accent/10 text-accent font-medium" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
              } ${c.ativo ? "" : "opacity-60"}`}
            >
              {c.nome.split(" ").slice(0, 2).join(" ")}
              {!c.ativo && " (desligado)"}
            </Link>
          ))}
        </div>
        <div className="ml-auto">
          <NavegacaoMes mes={mes} href={(m) => link(m)} />
        </div>
      </div>

      <p className="text-sm text-neutral-500 mb-3">
        <span className="font-medium text-neutral-900">{atual.nome}</span> · CPF {formatarCpf(atual.cpf)} · {atual.jornada.nome}
        {espelho.bancoDesde && <> · banco de horas desde {espelho.bancoDesde.split("-").reverse().join("/")}</>}
      </p>

      <ResumoEspelho espelho={espelho} />
      <div className="my-4">
        <LegendaEspelho />
      </div>
      <Card>
        <TabelaEspelho espelho={espelho} colaboradorId={atual.id} editavel mostrarFotos />
      </Card>
    </>
  );
}
