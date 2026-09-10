"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

/**
 * Menu de triagem do primeiro contato.
 *
 * A lista inteira é editada como rascunho local e só vai pro servidor no
 * "Salvar" — mesma escolha do horário de atendimento, pelo mesmo motivo: o
 * worker lê essa configuração a cada mensagem recebida, e salvar linha a
 * linha ofereceria ao cliente um menu meio-montado.
 */

// Destino vem do servidor já resolvido (nome, cor, se está em pé) pra tela
// não ter que cruzar três rotas só pra desenhar um <option>. null existe
// porque a opção pode ter ficado sem destino válido depois de gravada.
type Destino = {
  tipo: "SETOR" | "ATENDENTE";
  id: string;
  nome: string;
  cor: string | null;
  ativo: boolean;
};

type Opcao = {
  rotulo: string;
  destino: Destino | null;
};

type SetorLista = { id: string; nome: string; ativo: boolean; membros: { id: string }[] };

type Config = {
  ativa: boolean;
  mensagem: string | null;
  opcoes: Opcao[];
};

type Atendente = { id: string; name: string };

// O seletor guarda "SETOR:id" ou "ATENDENTE:id" num campo só. Setores e
// pessoas numa lista única de propósito: pra quem configura, "encaminhar pra
// fila do Fiscal" e "encaminhar pra Camila" são a mesma pergunta, e dois
// seletores lado a lado obrigariam a entender a diferença antes de escolher.
function paraValor(d: Destino | null) {
  return d ? d.tipo + ":" + d.id : "";
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function UraPanel({ podeEditar }: { podeEditar: boolean }) {
  const { data, mutate } = useSWR<Config>("/api/ura", fetcher);
  const { data: atendentes } = useSWR<Atendente[]>("/api/users", fetcher);
  const { data: setores } = useSWR<SetorLista[]>("/api/setores", fetcher);

  const [ativa, setAtiva] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (data && opcoes === null) {
      setAtiva(data.ativa);
      setMensagem(data.mensagem ?? "");
      setOpcoes(data.opcoes);
    }
  }, [data, opcoes]);

  function mexeu() {
    setSalvo(false);
    setErro(null);
  }

  function alteraOpcao(i: number, campos: Partial<Opcao>) {
    setOpcoes((atual) => (atual ?? []).map((o, idx) => (idx === i ? { ...o, ...campos } : o)));
    mexeu();
  }

  function adiciona() {
    setOpcoes((atual) => [...(atual ?? []), { rotulo: "", destino: null }]);
    mexeu();
  }

  function remove(i: number) {
    setOpcoes((atual) => (atual ?? []).filter((_, idx) => idx !== i));
    mexeu();
  }

  function move(i: number, direcao: -1 | 1) {
    setOpcoes((atual) => {
      const lista = [...(atual ?? [])];
      const destino = i + direcao;
      if (destino < 0 || destino >= lista.length) return lista;
      [lista[i], lista[destino]] = [lista[destino], lista[i]];
      return lista;
    });
    mexeu();
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);

    const res = await fetch("/api/ura", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ativa,
        mensagem: mensagem.trim() || null,
        opcoes: (opcoes ?? []).map((o) => ({
          rotulo: o.rotulo,
          // O botão de salvar fica travado enquanto houver opção sem destino
          // (ver `incompleta`), então aqui destino nunca é null.
          destino: { tipo: o.destino!.tipo, id: o.destino!.id },
        })),
      }),
    });
    setSalvando(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErro(typeof body.error === "string" ? body.error : "não deu pra salvar o menu");
      return;
    }
    setSalvo(true);
    mutate();
  }

  if (!data || opcoes === null) return <p className="text-sm text-neutral-500">Carregando menu...</p>;

  const incompleta = opcoes.some((o) => !o.rotulo.trim() || !o.destino);

  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-4 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-800">Menu de triagem (URA)</h2>
        <p className="text-xs text-neutral-600 mt-1">
          No primeiro contato, o cliente recebe a lista de opções e responde com um número. A
          conversa é <strong>atribuída na hora</strong> a quem cuida daquele assunto, sem ninguém
          precisar ler e distribuir. Enquanto o menu está ligado, ele substitui a saudação de
          primeiro contato.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ativa}
          disabled={!podeEditar}
          onChange={(e) => {
            setAtiva(e.target.checked);
            mexeu();
          }}
        />
        <span className={ativa ? "text-neutral-800" : "text-neutral-500"}>
          {ativa ? "Menu ligado" : "Menu desligado"}
        </span>
      </label>

      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          Mensagem de abertura
        </label>
        <textarea
          value={mensagem}
          disabled={!podeEditar}
          onChange={(e) => {
            setMensagem(e.target.value);
            mexeu();
          }}
          rows={2}
          placeholder="Ex: Olá! Você chegou à Guttierres Contabilidade. Com qual setor precisa falar?"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <p className="text-xs text-neutral-500 mt-1">
          As opções entram embaixo dela, numeradas automaticamente.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-neutral-700">Opções</span>

        {opcoes.length === 0 && (
          <p className="text-xs text-neutral-500">
            Nenhuma opção ainda. Cadastre os setores que atendem pelo WhatsApp.
          </p>
        )}

        {opcoes.map((o, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-5 shrink-0 text-center font-mono text-xs text-neutral-500">
              {i + 1}
            </span>
            <input
              value={o.rotulo}
              disabled={!podeEditar}
              onChange={(e) => alteraOpcao(i, { rotulo: e.target.value })}
              placeholder="Setor (ex: Fiscal)"
              className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <select
              value={paraValor(o.destino)}
              disabled={!podeEditar}
              onChange={(e) => {
                const [tipo, id] = e.target.value.split(":");
                if (!id) return alteraOpcao(i, { destino: null });
                const nome =
                  tipo === "SETOR"
                    ? ((setores ?? []).find((x) => x.id === id)?.nome ?? "")
                    : ((atendentes ?? []).find((x) => x.id === id)?.name ?? "");
                alteraOpcao(i, {
                  destino: { tipo: tipo as Destino["tipo"], id, nome, cor: null, ativo: true },
                });
              }}
              className="w-52 shrink-0 rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-100"
            >
              <option value="">quem recebe...</option>

              {/* O destino já escolhido entra na lista mesmo se tiver caído
                  (pessoa desativada, setor desativado ou esvaziado): sem isso
                  o seletor apareceria vazio e a configuração pareceria
                  corrompida em vez de desatualizada. */}
              {o.destino && !o.destino.ativo && (
                <option value={paraValor(o.destino)}>{o.destino.nome} (indisponível)</option>
              )}

              {/* Setor sem ninguém dentro fica fora da lista: escolher ele
                  seria mandar a conversa pra uma fila que ninguém enxerga, e
                  a rota recusaria o salvamento de qualquer jeito. */}
              <optgroup label="Setores">
                {(setores ?? [])
                  .filter((x) => x.ativo && x.membros.length > 0)
                  .map((x) => (
                    <option key={x.id} value={"SETOR:" + x.id}>
                      {x.nome}
                    </option>
                  ))}
              </optgroup>

              <optgroup label="Pessoas">
                {(atendentes ?? []).map((a) => (
                  <option key={a.id} value={"ATENDENTE:" + a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            </select>
            {podeEditar && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Subir opção"
                  className="px-1.5 py-1 text-neutral-500 hover:text-neutral-800 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === opcoes.length - 1}
                  aria-label="Descer opção"
                  className="px-1.5 py-1 text-neutral-500 hover:text-neutral-800 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="px-1.5 py-1 text-xs text-red-600 hover:underline"
                >
                  remover
                </button>
              </div>
            )}
          </div>
        ))}

        {podeEditar && opcoes.length < 9 && (
          <button
            type="button"
            onClick={adiciona}
            className="self-start text-xs text-accent hover:underline"
          >
            + Adicionar opção
          </button>
        )}
      </div>

      {opcoes.some((o) => o.destino && !o.destino.ativo) && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Uma das opções aponta para um destino que não está em pé: alguém desativado, ou um setor
          desativado ou sem ninguém dentro. Enquanto estiver assim, essa opção não é oferecida ao
          cliente.
        </p>
      )}

      {erro && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button
            onClick={salvar}
            disabled={salvando || incompleta}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar menu"}
          </button>
          {incompleta && (
            <span className="text-xs text-neutral-500">
              toda opção precisa de um nome e de quem recebe
            </span>
          )}
          {salvo && !incompleta && <span className="text-xs text-accent">salvo</span>}
        </div>
      )}
    </div>
  );
}
