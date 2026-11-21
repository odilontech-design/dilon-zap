import { Card, Etiqueta } from "@/components/ui";
import { exigirRecurso, requireColaborador } from "@/lib/session";
import { hojeNoFuso } from "@/lib/datas";
import { cancelarSolicitacao } from "@/lib/solicitacoes";
import { listarSolicitacoes, TOM_STATUS } from "@/lib/solicitacoes-dados";
import { BotaoCancelar, FormularioSolicitacao } from "./formulario";

export const dynamic = "force-dynamic";

export default async function MinhasSolicitacoes() {
  const u = await requireColaborador();
  exigirRecurso(u, "SOLICITACOES");
  const fuso = u.empresa.timezone;
  const lista = await listarSolicitacoes({ colaboradorId: u.colaboradorId }, fuso, 50);

  return (
    <div className="space-y-4 py-2">
      <Card className="p-4">
        <p className="font-semibold text-neutral-900 mb-3">Nova solicitação</p>
        <FormularioSolicitacao hoje={hojeNoFuso(fuso)} />
      </Card>
      <Card className="p-4">
        <p className="font-semibold text-neutral-900">Minhas solicitações</p>
        {lista.length === 0 ? (
          <p className="text-sm text-neutral-500 mt-2">Você ainda não fez nenhuma solicitação.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200">
            {lista.map((s) => (
              <li key={s.id} className="py-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-neutral-900">{s.resumo}</span>
                  <Etiqueta tom={TOM_STATUS[s.status]}>{s.statusRotulo}</Etiqueta>
                </div>
                <p className="text-neutral-600">{s.justificativa}</p>
                <p className="text-xs text-neutral-500 flex flex-wrap gap-x-3">
                  <span>Enviada em {s.abertaEm}</span>
                  {s.anexo && (
                    <a href={`/api/solicitacoes/${s.id}/anexo`} target="_blank" rel="noreferrer" className="text-accent">
                      anexo
                    </a>
                  )}
                  {s.status === "PENDENTE" && <BotaoCancelar id={s.id} cancelar={cancelarSolicitacao} />}
                </p>
                {s.resposta && <p className="text-xs text-neutral-700">Resposta: {s.resposta}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
