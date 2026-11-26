"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, erroDaResposta, fetcher, secao } from "../comum";

type Painel = {
  configurada: boolean;
  conta: { status: "CONECTADA" | "ERRO" | "DESCONECTADA"; contaNome: string | null; contaEmail: string | null; erro: string | null; conectadaEm: string } | null;
  contagem: Record<string, number>;
  semKm: number;
  semChassi: number;
  /** Vagas que restam no pacote de publicação (null = o Mercado Livre não respondeu ou ainda não há conta). */
  vagas: number | null;
  problemas: { id: string; veiculoId: string; status: string; erro: string | null; veiculo: { marca: string; modelo: string; versao: string | null; anoModelo: number; placa: string | null } }[];
};

const ROTULOS: [string, string][] = [["PUBLICADO", "No ar"], ["FILA", "Na fila"], ["ERRO", "Com problema"]];
const RETORNO: Record<string, { texto: string; erro?: boolean }> = {
  conectada: { texto: "Mercado Livre conectado. Agora é só escolher os carros." },
  negada: { texto: "A autorização foi negada no Mercado Livre.", erro: true },
  invalida: { texto: "O retorno do Mercado Livre não confere com o pedido. Tente conectar de novo.", erro: true },
  falhou: { texto: "O Mercado Livre não confirmou a conexão. Tente de novo em instantes.", erro: true },
  "nao-configurada": { texto: "A integração com o Mercado Livre ainda não foi liberada no servidor.", erro: true },
};

/** Conta do Mercado Livre: autoriza com a conta da loja, mostra as vagas do pacote, anuncia e mostra o que precisa de atenção. */
export function PainelMercadoLivre() {
  const { data, mutate } = useSWR<Painel>("/api/portais/mercadolivre", fetcher, { refreshInterval: 30_000 });
  const conectada = data?.conta?.status === "CONECTADA";
  const params = useSearchParams();
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    const r = params.get("mercadolivre");
    if (r && RETORNO[r]) setAviso(RETORNO[r]);
  }, [params]);
  if (!data) return null;

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
    <section className={secao} data-testid="painel-mercadolivre">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Mercado Livre</h2>
        {conectada ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">Conectada</span>
        ) : data.conta?.status === "ERRO" ? (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600">Precisa de atenção</span>
        ) : (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">Não conectada</span>
        )}
      </div>
      {aviso && <p className={`rounded-md px-3 py-2 text-xs ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}
      {data.conta?.erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">{data.conta.erro}</p>}
      {!conectada ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600">
            Entre com a conta da loja no Mercado Livre (a conta precisa estar no perfil de concessionária) e autorize o Zap a publicar o estoque. A senha do Mercado Livre não passa pelo Zap.
          </p>
          <p className="text-xs text-neutral-500">Para anunciar veículos a loja precisa ter um pacote de publicação contratado com o Mercado Livre: a contratação é feita direto com o comercial deles (veiculos@mercadolivre.com).</p>
          {!data.configurada && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">A integração ainda não foi liberada no servidor (app da Dilon Tech no Mercado Livre).</p>}
          <div>
            <a href="/api/portais/mercadolivre/conectar" className={`${botaoPrimario} inline-block ${data.configurada ? "" : "pointer-events-none opacity-50"}`}>{data.conta ? "Reconectar o Mercado Livre" : "Conectar o Mercado Livre"}</a>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-600">Conta {data.conta?.contaNome}.</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {ROTULOS.map(([s, nome]) => <span key={s} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{nome}: {data.contagem[s] ?? 0}</span>)}
            <span className={`rounded-full px-2 py-0.5 text-xs ${data.vagas === 0 ? "bg-red-500/10 text-red-600" : "bg-neutral-100"}`}>Vagas no pacote: {data.vagas === null ? "sem resposta" : data.vagas}</span>
          </div>
          {data.vagas === 0 && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">O pacote de publicação não tem mais vagas: os carros novos ficam esperando. Contrate mais anúncios com o Mercado Livre ou tire outro carro do portal.</p>}
          {data.semKm > 0 && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{data.semKm} carro(s) sem quilometragem informada: o Zap não anuncia carro sem km.</p>}
          {data.semChassi > 0 && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{data.semChassi} carro(s) sem placa ou sem chassi: o Mercado Livre confere o veículo pela placa e pelos 6 últimos caracteres do chassi.</p>}
          <div className="flex flex-wrap gap-2">
            <button
              className={botaoPrimario}
              disabled={ocupado}
              onClick={() => confirm("Anunciar todos os carros disponíveis no Mercado Livre?\n\nCada anúncio ocupa uma vaga do pacote de publicação da loja.") && chamar("/api/portais/mercadolivre/anunciar", "POST", { todos: true })}
            >
              Anunciar todos os disponíveis
            </button>
            <button className={botaoSecundario} disabled={ocupado} onClick={() => chamar("/api/portais/mercadolivre/desconectar", "POST")}>Desconectar</button>
          </div>
          {data.problemas.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-red-600">
              {data.problemas.map((p) => <li key={p.id}>{p.veiculo.marca} {p.veiculo.modelo} {p.veiculo.anoModelo}: {p.erro}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
