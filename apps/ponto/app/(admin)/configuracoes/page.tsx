import { prisma, verificarCadeia } from "@dilon-zap/ponto-db";
import { requireAdmin } from "@/lib/session";
import { formatarCnpj } from "@/lib/documentos";
import { hojeNoFuso } from "@/lib/datas";
import { PLANOS } from "@/lib/planos";
import { Card, Etiqueta, TituloPagina } from "@/components/ui";
import { FormularioConfiguracoes, Feriados } from "./formularios";

export const dynamic = "force-dynamic";

export default async function PaginaConfiguracoes() {
  const u = await requireAdmin();
  const ano = Number(hojeNoFuso(u.empresa.timezone).slice(0, 4));
  const [empresa, feriados, ativos, jornadas, cadeia] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: u.empresaId } }),
    prisma.feriado.findMany({
      where: { empresaId: u.empresaId, data: { gte: new Date(`${ano}-01-01T00:00:00Z`) } },
      orderBy: { data: "asc" },
    }),
    prisma.colaborador.count({ where: { empresaId: u.empresaId, ativo: true } }),
    prisma.jornada.count({ where: { empresaId: u.empresaId } }),
    verificarCadeia(u.empresaId),
  ]);
  const plano = PLANOS[empresa.plano];

  return (
    <>
      <TituloPagina titulo="Configurações" descricao="Dados da empresa, regras de cálculo, feriados e plano." />
      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-6">
          <Card className="p-5">
            <FormularioConfiguracoes
              inicial={{
                razaoSocial: empresa.razaoSocial,
                nomeFantasia: empresa.nomeFantasia ?? "",
                timezone: empresa.timezone as "America/Sao_Paulo",
                exigirLocalizacao: empresa.exigirLocalizacao,
                toleranciaPorMarcacaoMin: empresa.toleranciaPorMarcacaoMin,
                toleranciaDiariaMin: empresa.toleranciaDiariaMin,
                percentualExtraBp: empresa.percentualExtraBp,
                percentualDescansoBp: empresa.percentualDescansoBp,
                percentualNoturnoBp: empresa.percentualNoturnoBp,
                bancoDeHoras: empresa.bancoDeHoras,
                validadeBancoDias: empresa.validadeBancoDias,
              }}
              cnpj={formatarCnpj(empresa.cnpj)}
            />
          </Card>
          <Card className="p-5">
            <Feriados ano={ano} feriados={feriados.map((f) => ({ id: f.id, data: f.data.toISOString().slice(0, 10), nome: f.nome }))} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-neutral-900">Plano {plano.nome}</p>
              <Etiqueta tom="azul">ativo</Etiqueta>
            </div>
            <p className="text-neutral-700">{plano.precoDescricao}</p>
            <ul className="text-neutral-600 space-y-1">
              <li>
                Colaboradores ativos: {ativos}
                {plano.maxColaboradores ? ` de ${plano.maxColaboradores}` : ""}
              </li>
              <li>
                Jornadas (turnos): {jornadas}
                {plano.maxJornadas ? ` de ${plano.maxJornadas}` : ""}
              </li>
              <li>CNPJ: {plano.maxCnpjs === 1 ? "1 (esta empresa)" : `até ${plano.maxCnpjs}`}</li>
              <li>Pagamento: boleto bancário</li>
              <li>Suporte humano por telefone e chat, sem limite</li>
            </ul>
            {empresa.plano === "ESSENCIAL" && (
              <p className="text-xs text-neutral-500 border-t border-neutral-200 pt-3">
                Precisa de mais colaboradores, reconhecimento facial, quiosque na recepção ou ponto pelo WhatsApp? O plano Ponto cobre tudo isso.
                Fale com o suporte.
              </p>
            )}
          </Card>

          <Card className="p-5 text-sm space-y-2">
            <p className="font-semibold text-neutral-900">Integridade dos registros</p>
            <p className="text-neutral-600">
              {cadeia.total} marcações registradas. Cada uma guarda o código da anterior, e o banco de dados recusa alteração ou exclusão.
            </p>
            {cadeia.quebraNoNsr == null ? (
              <Etiqueta tom="verde">Sequência íntegra</Etiqueta>
            ) : (
              <Etiqueta tom="vermelho">Sequência quebrada no NSR {cadeia.quebraNoNsr}: fale com o suporte</Etiqueta>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
