import Link from "next/link";
import { prisma } from "@dilon-zap/ponto-db";
import { requireAdminMesmoBloqueado } from "@/lib/session";
import { situacaoDaEmpresa, TOLERANCIA_DIAS } from "@/lib/cobranca";
import type { EstadoAssinatura } from "@/lib/cobranca-regras";
import { dataBr } from "@/lib/datas";
import { PLANOS } from "@/lib/planos";
import { MenuAdmin } from "@/components/menu";
import { Card, Etiqueta, TituloPagina, type Tom } from "@/components/ui";
import { AvisoAssinatura } from "@/components/aviso-assinatura";
import { BotaoAtualizar, CopiarLinha } from "./botoes";

export const dynamic = "force-dynamic";

const ESTADO: Record<EstadoAssinatura, { rotulo: string; tom: Tom }> = {
  ISENTA: { rotulo: "Isenta de cobrança", tom: "neutro" },
  EM_DIA: { rotulo: "Em dia", tom: "verde" },
  AGUARDANDO_PAGAMENTO: { rotulo: "Aguardando pagamento", tom: "azul" },
  VENCIDA: { rotulo: "Vencida", tom: "amarelo" },
  BLOQUEADA: { rotulo: "Painel bloqueado", tom: "vermelho" },
  SEM_BOLETO: { rotulo: "Boleto não gerado", tom: "amarelo" },
  CANCELADA: { rotulo: "Cancelada", tom: "vermelho" },
};

const STATUS_FATURA: Record<string, { rotulo: string; tom: Tom }> = {
  PENDENTE: { rotulo: "em aberto", tom: "azul" },
  VENCIDA: { rotulo: "vencida", tom: "vermelho" },
  PAGA: { rotulo: "paga", tom: "verde" },
  CANCELADA: { rotulo: "cancelada", tom: "neutro" },
};

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Assinatura e boletos. Fica FORA do grupo (admin) porque é a única tela que
 * o administrador vê com o painel bloqueado.
 */
export default async function PaginaAssinatura() {
  const u = await requireAdminMesmoBloqueado();
  const [situacao, empresa] = await Promise.all([
    situacaoDaEmpresa(u.empresaId),
    prisma.empresa.findUniqueOrThrow({
      where: { id: u.empresaId },
      include: { faturas: { orderBy: { vencimento: "desc" }, take: 24 } },
    }),
  ]);
  const plano = PLANOS[empresa.plano];
  const estado = ESTADO[situacao.estado];
  const emAberto = empresa.faturas.find((f) => f.id === situacao.emAberto?.id);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <MenuAdmin
        nome={u.nome}
        empresa={u.empresa.nomeFantasia || u.empresa.razaoSocial}
        plano={plano.nome}
        temColaborador={Boolean(u.colaboradorId)}
      />
      <main className="flex-1 min-w-0 p-5 md:p-8 max-w-4xl">
        <TituloPagina titulo="Assinatura" descricao={`Plano ${plano.nome}: ${plano.precoDescricao}. Pagamento por boleto bancário, sem fidelidade.`} />
        {!situacao.painelBloqueado && <AvisoAssinatura situacao={situacao} />}

        {situacao.estado === "BLOQUEADA" && (
          <Card className="p-5 mb-6 border-red-500/30">
            <p className="font-semibold text-red-700">O painel está bloqueado por mensalidade em aberto</p>
            <p className="text-sm text-neutral-700 mt-1">
              Os seus colaboradores continuam batendo ponto normalmente e nada foi apagado. Assim que o pagamento for confirmado, o painel volta
              sozinho. O boleto compensa em até 3 dias úteis; o Pix da mesma página compensa na hora.
            </p>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card className="p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-neutral-500">Situação</p>
              <Etiqueta tom={estado.tom}>{estado.rotulo}</Etiqueta>
            </div>
            {emAberto ? (
              <>
                <p className="text-2xl font-semibold text-neutral-900">{reais(emAberto.valorCentavos)}</p>
                <p className="text-sm text-neutral-600">
                  Vencimento {dataBr(emAberto.vencimento.toISOString().slice(0, 10))}
                  {situacao.bloqueiaEm && situacao.estado !== "BLOQUEADA" && <> · bloqueio a partir de {dataBr(situacao.bloqueiaEm)}</>}
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  {emAberto.urlFatura && (
                    <a href={emAberto.urlFatura} target="_blank" rel="noreferrer" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                      Pagar (boleto ou Pix)
                    </a>
                  )}
                  {emAberto.urlBoleto && (
                    <a href={emAberto.urlBoleto} target="_blank" rel="noreferrer" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
                      Baixar boleto (PDF)
                    </a>
                  )}
                </div>
                {emAberto.linhaDigitavel && (
                  <div className="pt-2">
                    <p className="font-mono text-xs text-neutral-700 break-all">{emAberto.linhaDigitavel}</p>
                    <CopiarLinha linha={emAberto.linhaDigitavel} />
                  </div>
                )}
              </>
            ) : situacao.estado === "SEM_BOLETO" ? (
              <p className="text-sm text-neutral-700">
                O boleto ainda não foi gerado{empresa.erroCobranca ? `: ${empresa.erroCobranca}` : "."} Tente de novo abaixo ou fale com o suporte.
              </p>
            ) : situacao.estado === "ISENTA" ? (
              <p className="text-sm text-neutral-700">Esta conta não recebe boletos.</p>
            ) : (
              <p className="text-sm text-neutral-700">Nenhuma mensalidade em aberto. Obrigado!</p>
            )}
          </Card>

          <Card className="p-5 text-sm text-neutral-700 space-y-1.5">
            <p className="font-medium text-neutral-900">Como funciona</p>
            <p>O boleto de cada mês é gerado automaticamente e também enviado para {empresa.emailCobranca ?? "o email de cobrança"}.</p>
            <p>Depois do vencimento há {TOLERANCIA_DIAS} dias de prazo. Passado isso, o painel do administrador fica bloqueado até o pagamento; o registro de ponto dos colaboradores nunca para.</p>
            <p>
              Dúvidas sobre a cobrança? Fale com o suporte.{" "}
              {!situacao.painelBloqueado && (
                <Link href="/configuracoes" className="text-accent">
                  Ver o plano
                </Link>
              )}
            </p>
          </Card>
        </div>

        {situacao.estado !== "ISENTA" && (
          <div className="mb-6">
            <BotaoAtualizar rotulo={situacao.estado === "SEM_BOLETO" ? "Gerar boleto" : "Já paguei: atualizar situação"} />
          </div>
        )}

        <Card>
          <p className="px-4 py-3 border-b border-neutral-200 font-medium text-neutral-900">Mensalidades</p>
          {empresa.faturas.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">Nenhuma mensalidade ainda.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 text-sm">
              {empresa.faturas.map((f) => (
                <li key={f.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <span className="tabular-nums w-24">{dataBr(f.vencimento.toISOString().slice(0, 10))}</span>
                  <span className="tabular-nums">{reais(f.valorCentavos)}</span>
                  <Etiqueta tom={STATUS_FATURA[f.status].tom}>{STATUS_FATURA[f.status].rotulo}</Etiqueta>
                  {f.pagaEm && <span className="text-xs text-neutral-500">paga em {dataBr(f.pagaEm.toISOString().slice(0, 10))}</span>}
                  {f.urlFatura && (
                    <a href={f.urlFatura} target="_blank" rel="noreferrer" className="ml-auto text-accent text-xs">
                      {f.status === "PAGA" ? "comprovante" : "abrir"}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </div>
  );
}
