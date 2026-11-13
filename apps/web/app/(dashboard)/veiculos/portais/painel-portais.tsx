"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { PainelWebmotors } from "./painel-webmotors";
import { botaoPrimario, botaoSecundario, campo, erroDaResposta, fetcher, rotulo, secao } from "../comum";

type Painel = {
  configurada: boolean;
  conta: { status: "CONECTADA" | "ERRO" | "DESCONECTADA"; contaNome: string | null; contaEmail: string | null; erro: string | null; conectadaEm: string; leadConfigId: string | null; leadErro: string | null; leadEm: string | null } | null;
  leads: {
    total30d: number;
    recentes: { id: string; origem: string; nome: string; telefone: string | null; email: string | null; mensagem: string; semTelefone: boolean; negociacaoId: string | null; recebidoEm: string }[];
  };
  config: { cep: string | null; telefone: string | null; whatsapp: string | null };
  contagem: Record<string, number>;
  disponiveis: number;
  semAnuncio: number;
  problemas: { id: string; veiculoId: string; status: string; erro: string | null; veiculo: { marca: string; modelo: string; versao: string | null; anoModelo: number; placa: string | null } }[];
};

const RETORNO: Record<string, { texto: string; erro?: boolean }> = {
  conectada: { texto: "Conta da OLX conectada. Agora é só escolher os carros; os contatos dos compradores vão cair no CRM." },
  "conectada-sem-leads": { texto: "Conta da OLX conectada, mas a OLX não aceitou o endereço dos contatos de compradores. Veja o motivo abaixo e tente de novo.", erro: true },
  negada: { texto: "A autorização foi negada na OLX.", erro: true },
  invalida: { texto: "O retorno da OLX não confere com o pedido. Tente conectar de novo.", erro: true },
  falhou: { texto: "A OLX não confirmou a conexão. Tente de novo em instantes.", erro: true },
  "nao-configurada": { texto: "A integração com a OLX ainda não foi configurada no servidor.", erro: true },
};

const ORIGEM: Record<string, string> = { whatsapp: "WhatsApp", telefone: "Telefone", chat: "Chat", financing: "Financiamento", olx: "OLX" };

const ROTULOS: [string, string][] = [
  ["PUBLICADO", "No ar"],
  ["ENVIADO", "Aguardando a OLX"],
  ["FILA", "Na fila"],
  ["ERRO", "Com problema"],
];

/** A aba Portais: conectar a conta da OLX, dados dos anúncios e o que precisa de atenção. */
export function PainelPortais() {
  const { data, error, mutate } = useSWR<Painel>("/api/portais", fetcher, { refreshInterval: 30_000 });
  const params = useSearchParams();
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [cep, setCep] = useState<string | null>(null);
  const [telefone, setTelefone] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const r = params.get("olx");
    if (r && RETORNO[r]) setAviso(RETORNO[r]);
  }, [params]);
  useEffect(() => {
    if (data && cep === null) {
      setCep(data.config.cep ?? "");
      setTelefone(data.config.telefone ?? "");
    }
  }, [data, cep]);

  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!data || cep === null || telefone === null) return <p className="text-sm text-neutral-500">Carregando…</p>;
  const conta = data.conta;
  const conectada = conta?.status === "CONECTADA";

  async function chamar(url: string, metodo: string, corpo?: object) {
    setAviso(null);
    setOcupado(true);
    try {
      const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
      if (!r.ok) {
        setAviso({ texto: await erroDaResposta(r), erro: true });
        return null;
      }
      mutate();
      return r.json();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {aviso && (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>
          {aviso.texto}
        </p>
      )}

      <section className={secao}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">OLX</h2>
          {conectada ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">Conectada</span>
          ) : conta?.status === "ERRO" ? (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600">Precisa de atenção</span>
          ) : (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">Não conectada</span>
          )}
        </div>
        {conectada ? (
          <p className="text-sm text-neutral-600">
            Conta {conta?.contaNome ?? ""} {conta?.contaEmail ? `(${conta.contaEmail})` : ""}, conectada em {new Date(conta!.conectadaEm).toLocaleDateString("pt-BR")}.
          </p>
        ) : (
          <p className="text-sm text-neutral-600">
            Conecte a conta profissional da loja na OLX. O Zap passa a publicar, atualizar e tirar do ar os carros do estoque sozinho.
          </p>
        )}
        {conta?.erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">{conta.erro}</p>}
        <div className="flex flex-wrap gap-2">
          {!data.configurada ? (
            <p className="text-xs text-neutral-500">A integração com a OLX está sendo liberada. Fale com o suporte da Dilon Tech.</p>
          ) : conectada ? (
            <button
              className={botaoSecundario}
              disabled={ocupado}
              onClick={() => {
                if (confirm("Desconectar a OLX? Os anúncios que já estão lá continuam no ar até você tirar pelo painel da OLX.")) chamar("/api/portais/olx/desconectar", "POST");
              }}
            >
              Desconectar
            </button>
          ) : (
            <a href="/api/portais/olx/conectar" className={botaoPrimario}>
              {conta ? "Conectar de novo" : "Conectar a OLX"}
            </a>
          )}
        </div>
      </section>

      <form
        className={secao}
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await chamar("/api/portais", "PUT", { cep: cep || null, telefone: telefone || null });
          if (r) setAviso({ texto: "Dados dos anúncios salvos." });
        }}
      >
        <h2 className="text-sm font-semibold">Dados de todos os anúncios</h2>
        <p className="text-xs text-neutral-500">A OLX exige CEP e telefone com DDD em cada anúncio. O CEP define a cidade em que o carro aparece.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1" htmlFor="cep-anuncios">
            <span className={rotulo}>CEP da loja</span>
            <input id="cep-anuncios" className={campo} inputMode="numeric" value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" />
          </label>
          <label className="flex flex-col gap-1" htmlFor="telefone-anuncios">
            <span className={rotulo}>Telefone dos anúncios</span>
            <input
              id="telefone-anuncios"
              className={campo}
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder={data.config.whatsapp ? `Vazio usa o WhatsApp da vitrine (${data.config.whatsapp})` : "(21) 99999-9999"}
            />
          </label>
        </div>
        <div>
          <button className={botaoPrimario} disabled={ocupado}>
            Salvar
          </button>
        </div>
      </form>

      {conectada && (
        <section className={secao}>
          <h2 className="text-sm font-semibold">Anúncios</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ROTULOS.map(([k, r]) => (
              <div key={k} className="rounded-md border border-neutral-200 p-3">
                <div className="text-xl font-semibold tabular-nums">{data.contagem[k] ?? 0}</div>
                <div className="text-xs text-neutral-500">{r}</div>
              </div>
            ))}
          </div>
          {data.semAnuncio > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">
                {data.semAnuncio} de {data.disponiveis} carro(s) disponível(is) ainda não estão marcados para a OLX.
              </p>
              <button
                className={botaoPrimario}
                disabled={ocupado}
                onClick={async () => {
                  const r = (await chamar("/api/portais/anunciar", "POST", { todos: true })) as { ligados: number; semCatalogo: number } | null;
                  if (r)
                    setAviso({
                      texto: `${r.ligados} carro(s) marcados para a OLX.${r.semCatalogo ? ` ${r.semCatalogo} precisam que você escolha o modelo no catálogo da OLX, na ficha de cada um.` : ""}`,
                    });
                }}
              >
                Anunciar todos os disponíveis
              </button>
            </div>
          )}
          <p className="text-xs text-neutral-500">A sincronização roda a cada minuto. Carro vendido, reservado ou devolvido sai do ar sozinho.</p>
        </section>
      )}

      {conectada && (
        <section className={secao}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Contatos de compradores</h2>
            {conta?.leadConfigId && !conta.leadErro ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">Recebendo</span>
            ) : (
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600">Não configurado</span>
            )}
          </div>
          <p className="text-xs text-neutral-500">
            WhatsApp, telefone, chat e simulação de financiamento da OLX viram negociação no CRM, com o carro, o valor e a tarefa de chamar.
            O chat da OLX chega só como aviso: para responder no próprio chat, use o portal. Para continuar a conversa, chame o comprador pelo telefone dele.
          </p>
          {conta?.leadErro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">{conta.leadErro}</p>}
          {(!conta?.leadConfigId || conta.leadErro) && (
            <div>
              <button
                className={botaoSecundario}
                disabled={ocupado}
                onClick={async () => {
                  const r = await chamar("/api/portais/olx/leads", "POST");
                  if (r) setAviso({ texto: "Pronto: a OLX vai entregar os contatos no CRM." });
                }}
              >
                Tentar de novo
              </button>
              <span className="ml-2 text-xs text-neutral-500">Se a OLX recusar, desconecte e conecte de novo para renovar a autorização.</span>
            </div>
          )}
          {data.leads.recentes.length > 0 ? (
            <>
              <p className="text-sm">{data.leads.total30d} contato(s) nos últimos 30 dias.</p>
              <ul className="flex flex-col divide-y divide-neutral-100 text-sm">
                {data.leads.recentes.map((l) => (
                  <li key={l.id} className="flex flex-col gap-0.5 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{l.nome}</span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{ORIGEM[l.origem] ?? l.origem}</span>
                      <span className="text-xs text-neutral-500">{new Date(l.recebidoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                      {l.negociacaoId && (
                        <Link href="/funil" className="text-xs text-accent hover:underline">
                          ver no CRM
                        </Link>
                      )}
                    </div>
                    {l.mensagem && <span className="text-xs text-neutral-600">{l.mensagem}</span>}
                    {l.semTelefone && <span className="text-xs text-amber-700">Sem telefone: chame por e-mail{l.email ? ` (${l.email})` : ""}, ou pelo portal.</span>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-neutral-500">Nenhum contato ainda.</p>
          )}
        </section>
      )}

      {data.problemas.length > 0 && (
        <section className={secao}>
          <h2 className="text-sm font-semibold">Precisa de atenção</h2>
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm">
            {data.problemas.map((p) => (
              <li key={p.id} className="flex flex-col gap-0.5 py-2">
                <Link href={`/veiculos/${p.veiculoId}`} className="font-medium text-accent hover:underline">
                  {p.veiculo.marca} {p.veiculo.modelo} {p.veiculo.versao ?? ""} {p.veiculo.anoModelo}
                </Link>
                <span className="text-xs text-red-600">{p.erro}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PainelWebmotors />

      <section className={secao}>
        <h2 className="text-sm font-semibold">Outros portais</h2>
        <p className="text-sm text-neutral-600">
          Mercado Livre usa a mesma fila de anúncios e entra em seguida. Enquanto isso, o feed do estoque (em Vitrine) já serve para
          portais que leem XML.
        </p>
      </section>
    </div>
  );
}
