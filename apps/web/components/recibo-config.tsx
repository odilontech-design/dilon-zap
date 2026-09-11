"use client";

import { useEffect, useState } from "react";

/**
 * Cabeçalho e rodapé do recibo impresso.
 *
 * Tudo opcional: sem nada preenchido o recibo sai com o nome da empresa no
 * sistema e funciona do mesmo jeito. Preencher é o que deixa o papel com cara
 * de comprovante da loja — razão social, CNPJ, endereço, telefone.
 */

type Config = {
  name: string;
  reciboNome: string | null;
  reciboDocumento: string | null;
  reciboEndereco: string | null;
  reciboTelefone: string | null;
  reciboRodape: string | null;
  reciboLarguraMm: number;
};

const CAMPOS = [
  { chave: "reciboNome", rotulo: "Nome no recibo", dica: "Razão social ou nome fantasia", max: 120 },
  { chave: "reciboDocumento", rotulo: "CNPJ ou CPF", dica: "Só os números já basta", max: 40 },
  { chave: "reciboEndereco", rotulo: "Endereço", dica: "Rua, número, bairro, cidade", max: 200 },
  { chave: "reciboTelefone", rotulo: "Telefone", dica: "Como deve sair impresso", max: 80 },
] as const;

export function ReciboConfig({ onFechar }: { onFechar: () => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/recibo/config")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setConfig(await res.json());
      })
      .catch(() => setErro("não foi possível carregar os dados do recibo"));
  }, []);

  function muda<K extends keyof Config>(chave: K, valor: Config[K]) {
    setConfig((c) => (c ? { ...c, [chave]: valor } : c));
  }

  async function salvar() {
    if (!config) return;
    setErro(null);
    setSalvando(true);
    const res = await fetch("/api/recibo/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reciboNome: config.reciboNome,
        reciboDocumento: config.reciboDocumento,
        reciboEndereco: config.reciboEndereco,
        reciboTelefone: config.reciboTelefone,
        reciboRodape: config.reciboRodape,
        reciboLarguraMm: config.reciboLarguraMm,
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErro(typeof b.error === "string" ? b.error : "não deu pra salvar — confira os campos");
      return;
    }
    onFechar();
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg border border-neutral-200 w-full max-w-lg max-h-[92vh] flex flex-col"
      >
        <header className="p-5 border-b border-neutral-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Dados do recibo</h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              O que sai no topo e no pé do recibo impresso de cada pedido fechado.
            </p>
          </div>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none" aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="overflow-y-auto p-5 flex flex-col gap-4 text-sm">
          {erro && <p className="rounded-md border border-red-300 bg-red-50 text-red-700 px-3 py-2">{erro}</p>}
          {!config && !erro && <p className="text-neutral-500">Carregando...</p>}

          {config && (
            <>
              {CAMPOS.map((c) => (
                <label key={c.chave}>
                  <span className="text-xs font-medium text-neutral-700">{c.rotulo}</span>
                  <input
                    value={config[c.chave] ?? ""}
                    onChange={(e) => muda(c.chave, e.target.value)}
                    maxLength={c.max}
                    placeholder={c.chave === "reciboNome" ? config.name : c.dica}
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
                  />
                </label>
              ))}

              <label>
                <span className="text-xs font-medium text-neutral-700">Mensagem no pé do recibo</span>
                <textarea
                  value={config.reciboRodape ?? ""}
                  onChange={(e) => muda("reciboRodape", e.target.value)}
                  maxLength={400}
                  rows={3}
                  placeholder="Ex.: Trocas em até 7 dias com este comprovante. Obrigada pela preferência!"
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 resize-y"
                />
              </label>

              <fieldset>
                <legend className="text-xs font-medium text-neutral-700">Largura do papel da impressora</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {[
                    { mm: 80, texto: "80 mm", sub: "Impressora de balcão" },
                    { mm: 58, texto: "58 mm", sub: "Impressora portátil" },
                  ].map((o) => (
                    <label
                      key={o.mm}
                      className={`rounded-md border px-3 py-2 cursor-pointer ${
                        config.reciboLarguraMm === o.mm ? "border-accent ring-1 ring-accent" : "border-neutral-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="largura"
                        className="sr-only"
                        checked={config.reciboLarguraMm === o.mm}
                        onChange={() => muda("reciboLarguraMm", o.mm)}
                      />
                      <span className="font-medium">{o.texto}</span>
                      <span className="block text-xs text-neutral-500">{o.sub}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-1.5">
                  Na dúvida, meça a bobina: a larga é 80 mm, a estreita é 58 mm.
                </p>
              </fieldset>

              <p className="text-xs text-neutral-500">
                CPF e endereço do cliente saem no recibo quando estão preenchidos na ficha dele.
              </p>
            </>
          )}
        </div>

        <footer className="p-4 border-t border-neutral-200 flex justify-end gap-2 text-sm">
          <button onClick={onFechar} className="rounded-md border border-neutral-300 px-4 py-2">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={!config || salvando}
            className="rounded-md bg-accent text-white px-4 py-2 font-medium disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
