"use client";

import { useState } from "react";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, erroDaResposta, fetcher, secao } from "../comum";

type Central = {
  endereco: string | null;
  distribuirLeads: boolean;
  total30d: number;
  aguardando: number;
  leads: { id: string; portalNome: string; nome: string; telefone: string | null; email: string | null; mensagem: string; semTelefone: boolean; recebidoEm: string; respondidoEm: string | null; veiculo: { marca: string; modelo: string; anoModelo: number } | null; negociacaoId: string | null }[];
  emailsSemLeitura: { id: string; de: string; assunto: string; motivo: string | null; situacao: string; recebidoEm: string }[];
};

function espera(desde: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}

/** Central de leads: o endereço que recebe os e-mails dos portais, os leads com o tempo de espera e o que não foi entendido. */
export function CentralDeLeads() {
  const { data, mutate } = useSWR<Central>("/api/leads/central", fetcher, { refreshInterval: 30_000 });
  const [aviso, setAviso] = useState<string | null>(null);
  if (!data) return null;

  async function chamar(url: string, metodo: string, corpo?: object) {
    setAviso(null);
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (!r.ok) return setAviso(await erroDaResposta(r));
    mutate();
  }

  return (
    <section className={secao} data-testid="central-leads">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Central de leads</h2>
        <span className="text-xs text-neutral-500">
          {data.total30d} nos últimos 30 dias{data.aguardando > 0 ? ` · ${data.aguardando} sem resposta` : ""}
        </span>
      </div>

      {data.endereco ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-neutral-600">Endereço de entrada dos e-mails dos portais (configure o encaminhamento ou o webhook do e-mail recebido para ele):</p>
          <code className="break-all rounded-md bg-neutral-100 px-2 py-1 text-xs" data-testid="endereco-leads">{data.endereco}</code>
          <div>
            <button className={botaoSecundario} onClick={() => confirm("Trocar o endereço invalida o encaminhamento atual. Continuar?") && chamar("/api/leads/central", "POST")}>Gerar outro endereço</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600">Os portais (Na Pista, MobiAuto, Webmotors) avisam os contatos por e-mail. Gere o endereço de entrada e encaminhe esses e-mails para ele: cada contato vira negociação no CRM, com o carro e uma tarefa de chamar.</p>
          <div><button className={botaoPrimario} onClick={() => chamar("/api/leads/central", "POST")}>Gerar endereço de entrada</button></div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={data.distribuirLeads} onChange={(e) => chamar("/api/leads/central", "PUT", { distribuirLeads: e.target.checked })} />
        Repartir os leads novos entre os vendedores (quem tem menos negociações abertas recebe)
      </label>

      {data.emailsSemLeitura.length > 0 && (
        <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700" data-testid="emails-nao-entendidos">
          <p className="font-medium">E-mails que chegaram e o Zap não conseguiu ler:</p>
          <ul className="mt-1 list-disc pl-4">
            {data.emailsSemLeitura.map((e) => (
              <li key={e.id}>{e.assunto || "(sem assunto)"} — {e.de}: {e.motivo}</li>
            ))}
          </ul>
        </div>
      )}

      {data.leads.length > 0 && (
        <ul className="flex flex-col divide-y divide-neutral-100 text-sm">
          {data.leads.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate"><span className="font-medium">{l.nome}</span> <span className="text-xs text-neutral-500">via {l.portalNome}</span></p>
                <p className="truncate text-xs text-neutral-500">
                  {l.veiculo ? `${l.veiculo.marca} ${l.veiculo.modelo} ${l.veiculo.anoModelo} · ` : ""}
                  {l.telefone ?? l.email ?? "sem contato"}
                  {l.mensagem ? ` · "${l.mensagem.slice(0, 80)}"` : ""}
                </p>
              </div>
              {l.respondidoEm ? (
                <span className="text-xs text-emerald-700">respondido</span>
              ) : (
                <button className={botaoSecundario} onClick={() => chamar(`/api/leads/${l.id}/respondido`, "POST")}>aguardando há {espera(l.recebidoEm)} · marcar respondido</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className="text-sm text-red-600">{aviso}</p>}
    </section>
  );
}
