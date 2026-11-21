import Link from "@/components/link";
import { Card, Etiqueta, TituloPagina, Vazio } from "@/components/ui";
import { exigirRecurso, requireAdmin } from "@/lib/session";
import { listarSolicitacoes, TOM_STATUS, type SolicitacaoVista } from "@/lib/solicitacoes-dados";
import { Decisao } from "./decisao";

export const dynamic = "force-dynamic";

function Linha({ s, decidir }: { s: SolicitacaoVista; decidir: boolean }) {
  return (
    <li className="p-4 space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className="font-semibold text-neutral-900">{s.colaborador}</span>
          <span className="text-neutral-500"> · {s.tipoRotulo}</span>
        </p>
        <Etiqueta tom={TOM_STATUS[s.status]}>{s.statusRotulo}</Etiqueta>
      </div>
      <p className="font-medium text-neutral-800">{s.resumo}</p>
      <p className="text-neutral-600">“{s.justificativa}”</p>
      <p className="text-xs text-neutral-500 flex flex-wrap gap-x-3">
        <span>Enviada em {s.abertaEm}</span>
        {s.anexo && (
          <a href={`/api/solicitacoes/${s.id}/anexo`} target="_blank" rel="noreferrer" className="text-accent">
            ver anexo
          </a>
        )}
        {s.decisao && <span>Decidida por {s.decisao}</span>}
      </p>
      {s.resposta && <p className="text-xs text-neutral-700">Resposta: {s.resposta}</p>}
      {decidir && <Decisao id={s.id} />}
    </li>
  );
}

export default async function Solicitacoes({ searchParams }: { searchParams: { ver?: string } }) {
  const u = await requireAdmin();
  exigirRecurso(u, "SOLICITACOES");
  const historico = searchParams.ver === "historico";
  const fuso = u.empresa.timezone;
  const lista = await listarSolicitacoes(
    { empresaId: u.empresaId, ...(historico ? { status: { not: "PENDENTE" } } : { status: "PENDENTE" }) },
    fuso,
    historico ? 200 : 500,
  );
  const aba = (ativa: boolean) => `rounded-lg px-3 py-1.5 text-sm ${ativa ? "bg-accent/10 text-accent font-medium" : "text-neutral-600 hover:bg-neutral-100"}`;

  return (
    <>
      <TituloPagina
        titulo="Solicitações"
        descricao="Pedidos dos colaboradores: incluir ou desconsiderar marcação, abono e atestado. Ao aprovar, o ajuste entra no ponto com o seu nome; a marcação original continua guardada."
      />
      <div className="flex gap-1 mb-4">
        <Link href="/solicitacoes" className={aba(!historico)}>
          Aguardando
        </Link>
        <Link href="/solicitacoes?ver=historico" className={aba(historico)}>
          Histórico
        </Link>
      </div>
      <Card>
        {lista.length === 0 ? (
          <Vazio titulo={historico ? "Nenhuma solicitação decidida ainda" : "Nada aguardando"} descricao={historico ? undefined : "Quando um colaborador pedir um ajuste, ele aparece aqui."} />
        ) : (
          <ul className="divide-y divide-neutral-200">
            {lista.map((s) => (
              <Linha key={s.id} s={s} decidir={!historico} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
