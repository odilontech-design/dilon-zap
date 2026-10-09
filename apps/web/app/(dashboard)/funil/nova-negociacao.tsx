"use client";

import { useEffect, useState } from "react";
import { reaisParaCentavos, type Etapa, type Usuario } from "./tipos";

type ContatoBusca = { id: string; nome: string | null; telefone: string | null };

/**
 * Cria uma negociação. O cliente é um contato que já existe (busca) ou um
 * número novo digitado na hora — quem está ao telefone com o lead não vai
 * sair da tela para cadastrar contato antes.
 */
export function NovaNegociacao({
  funilId,
  etapas,
  usuarios,
  origens,
  etapaInicial,
  onFechar,
  onCriada,
}: {
  funilId: string;
  etapas: Etapa[];
  usuarios: Usuario[];
  origens: string[];
  etapaInicial?: string;
  onFechar: () => void;
  onCriada: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<ContatoBusca[]>([]);
  const [contato, setContato] = useState<ContatoBusca | null>(null);
  const [telefoneNovo, setTelefoneNovo] = useState("");

  const [titulo, setTitulo] = useState("");
  const [valor, setValor] = useState("");
  const [recorrencia, setRecorrencia] = useState<"UNICA" | "MENSAL">("UNICA");
  const [stageId, setStageId] = useState(etapaInicial ?? etapas[0]?.id ?? "");
  const [responsavelId, setResponsavelId] = useState("");
  const [origem, setOrigem] = useState("");
  const [previsao, setPrevisao] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (contato || busca.trim().length < 2) {
      setAchados([]);
      return;
    }
    // Espera a pessoa parar de digitar: uma busca por tecla seria uma consulta
    // à base de contatos inteira a cada letra.
    const t = setTimeout(async () => {
      const res = await fetch(`/api/negociacoes/contatos?q=${encodeURIComponent(busca.trim())}`);
      if (res.ok) setAchados(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [busca, contato]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const valorCents = reaisParaCentavos(valor);
    if (valorCents === null) return setErro("valor inválido");

    setSalvando(true);
    try {
      let contactId = contato?.id;
      if (!contactId) {
        if (telefoneNovo.replace(/\D/g, "").length < 8) {
          setErro("escolha um contato ou digite um telefone");
          return;
        }
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: telefoneNovo, name: busca.trim() || undefined }),
        });
        if (!res.ok) return setErro("não deu pra cadastrar o contato");
        contactId = (await res.json()).id as string;
      }

      const res = await fetch("/api/negociacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          funilId,
          stageId,
          titulo: titulo.trim(),
          valorCents,
          recorrencia,
          responsavelId: responsavelId || null,
          origem: origem.trim() || null,
          previsaoFechamento: previsao ? new Date(previsao).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return setErro(typeof body.error === "string" ? body.error : "não deu pra criar a negociação");
      }
      onCriada();
    } finally {
      setSalvando(false);
    }
  }

  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form onSubmit={salvar} className="bg-surface rounded-lg p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold mb-4">Nova negociação</h2>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Cliente</label>
            {contato ? (
              <div className="flex items-center justify-between rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <span className="truncate">{contato.nome || contato.telefone}</span>
                <button type="button" onClick={() => setContato(null)} className="text-xs text-accent hover:underline shrink-0">
                  trocar
                </button>
              </div>
            ) : (
              <>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou telefone"
                  className={campo}
                />
                {achados.length > 0 && (
                  <ul className="mt-1 rounded-md border border-neutral-200 divide-y divide-neutral-100 max-h-40 overflow-y-auto">
                    {achados.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setContato(c);
                            if (!titulo) setTitulo(c.nome || c.telefone || "");
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
                        >
                          {c.nome || "Sem nome"} <span className="text-xs text-neutral-400">{c.telefone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {busca.trim().length >= 2 && achados.length === 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] text-neutral-500 mb-1">Não achei. Cadastre pelo telefone:</p>
                    <input
                      value={telefoneNovo}
                      onChange={(e) => setTelefoneNovo(e.target.value)}
                      placeholder="DDD + número"
                      inputMode="tel"
                      className={campo}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Título</label>
            <input
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="ex: Plano Pro — Clínica Exemplo"
              className={campo}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Valor (R$)</label>
              <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" inputMode="decimal" className={campo} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Cobrança</label>
              <select value={recorrencia} onChange={(e) => setRecorrencia(e.target.value as "UNICA" | "MENSAL")} className={campo}>
                <option value="UNICA">Única</option>
                <option value="MENSAL">Mensal (recorrente)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Etapa</label>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={campo}>
                {etapas.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Responsável</label>
              <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={campo}>
                <option value="">Ninguém</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Origem</label>
              <input
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                list="origens-sugeridas"
                placeholder="Instagram, indicação…"
                className={campo}
              />
              <datalist id="origens-sugeridas">
                {origens.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Previsão de fechamento</label>
              <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} className={campo} />
            </div>
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Criar negociação"}
          </button>
        </div>
      </form>
    </div>
  );
}
