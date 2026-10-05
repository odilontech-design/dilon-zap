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
  reciboChavePix: string | null;
  reciboLogoKey: string | null;
  reciboCorDestaque: string | null;
  reciboTextoPendente: string | null;
  reciboTextoPago: string | null;
  reciboOcultarTelefone: boolean;
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
  const [logoOcupada, setLogoOcupada] = useState(false);

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

  // Logo sobe na hora, fora do Salvar: é arquivo, não campo de texto, e
  // guardá-la pra enviar junto com o resto obrigaria a segurar o arquivo em
  // memória e a reenviá-lo a cada salvada.
  async function enviarLogo(file: File) {
    setErro(null);
    setLogoOcupada(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/recibo/logo", { method: "POST", body: form });
    setLogoOcupada(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErro(typeof b.error === "string" ? b.error : "não deu pra enviar a logo");
      return;
    }
    const atual = await fetch("/api/recibo/config").then((r) => r.json());
    setConfig(atual);
  }

  async function removerLogo() {
    if (!confirm("Remover a logo do recibo?")) return;
    setErro(null);
    setLogoOcupada(true);
    const res = await fetch("/api/recibo/logo", { method: "DELETE" });
    setLogoOcupada(false);
    if (!res.ok) {
      setErro("não deu pra remover a logo");
      return;
    }
    setConfig((c) => (c ? { ...c, reciboLogoKey: null } : c));
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
        reciboChavePix: config.reciboChavePix,
        reciboCorDestaque: config.reciboCorDestaque,
        reciboTextoPendente: config.reciboTextoPendente,
        reciboTextoPago: config.reciboTextoPago,
        reciboOcultarTelefone: config.reciboOcultarTelefone,
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
              <fieldset className="rounded-md border border-neutral-200 p-3 flex flex-col gap-3">
                <legend className="px-1 text-xs font-medium text-neutral-700">
                  Identidade visual
                </legend>

                <div className="flex items-center gap-3">
                  <div
                    className="grid h-16 w-16 shrink-0 place-items-center rounded-md border border-neutral-200"
                    style={{ backgroundColor: config.reciboCorDestaque ?? "#0d9488" }}
                  >
                    {config.reciboLogoKey ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/recibo/logo?v=${encodeURIComponent(config.reciboLogoKey)}`}
                        alt="Logo do recibo"
                        className="max-h-14 max-w-14 object-contain"
                      />
                    ) : (
                      <span className="text-[10px] text-white/80">sem logo</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      <label className="cursor-pointer rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100">
                        {config.reciboLogoKey ? "Trocar logo" : "Enviar logo"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) enviarLogo(f);
                          }}
                        />
                      </label>
                      {config.reciboLogoKey && (
                        <button
                          onClick={removerLogo}
                          disabled={logoOcupada}
                          className="rounded-md px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <span className="text-xs text-neutral-500">
                      {logoOcupada ? "Enviando..." : "PNG, JPG ou WEBP, até 2MB. Sai no topo do recibo."}
                    </span>
                  </div>
                </div>

                <label className="flex items-center gap-3">
                  <input
                    type="color"
                    value={config.reciboCorDestaque ?? "#0d9488"}
                    onChange={(e) => muda("reciboCorDestaque", e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-neutral-300 bg-surface"
                  />
                  <span>
                    <span className="text-xs font-medium text-neutral-700">Cor da faixa do topo</span>
                    <span className="block text-xs text-neutral-500">
                      Também pinta o TOTAL. O texto sobre ela vira branco ou preto sozinho, pelo que
                      dá pra ler.
                    </span>
                  </span>
                </label>
              </fieldset>

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
                <span className="text-xs font-medium text-neutral-700">Chave PIX para cobrança</span>
                <input
                  value={config.reciboChavePix ?? ""}
                  onChange={(e) => muda("reciboChavePix", e.target.value)}
                  maxLength={140}
                  placeholder="CNPJ, telefone, e-mail ou chave aleatória"
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
                />
                <span className="text-xs text-neutral-500">
                  Sai no recibo só quando o pedido fecha como “PIX — a pagar”.
                </span>
              </label>

              <fieldset className="rounded-md border border-neutral-200 p-3 flex flex-col gap-3">
                <legend className="px-1 text-xs font-medium text-neutral-700">
                  Texto do corpo do recibo
                </legend>
                <p className="text-xs text-neutral-500">
                  Antes de pagar, o recibo é uma cobrança; depois de pago, é uma quitação. Use{" "}
                  <code className="rounded bg-neutral-100 px-1">{"{cliente}"}</code>{" "}
                  <code className="rounded bg-neutral-100 px-1">{"{valor}"}</code>{" "}
                  <code className="rounded bg-neutral-100 px-1">{"{mes}"}</code>{" "}
                  <code className="rounded bg-neutral-100 px-1">{"{numero}"}</code>{" "}
                  <code className="rounded bg-neutral-100 px-1">{"{data}"}</code> — o sistema troca
                  pelos dados do pedido. Em aberto, <code className="rounded bg-neutral-100 px-1">{"{valor}"}</code>{" "}
                  é o que falta pagar.
                </p>

                <label>
                  <span className="text-xs font-medium text-neutral-700">Enquanto está em aberto</span>
                  <textarea
                    value={config.reciboTextoPendente ?? ""}
                    onChange={(e) => muda("reciboTextoPendente", e.target.value)}
                    maxLength={600}
                    rows={3}
                    placeholder="Olá {cliente}, os honorários em aberto referentes aos serviços prestados em {mes} são de {valor}. Realize o pagamento pelo PIX abaixo."
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 resize-y"
                  />
                </label>

                <label>
                  <span className="text-xs font-medium text-neutral-700">Depois de pago</span>
                  <textarea
                    value={config.reciboTextoPago ?? ""}
                    onChange={(e) => muda("reciboTextoPago", e.target.value)}
                    maxLength={600}
                    rows={3}
                    placeholder="Recebemos a importância de {valor} referente aos serviços prestados em {mes}, dando plena e geral quitação."
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 resize-y"
                  />
                </label>
              </fieldset>

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

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={config.reciboOcultarTelefone}
                  onChange={(e) => muda("reciboOcultarTelefone", e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-xs font-medium text-neutral-700">
                    Não imprimir o telefone do cliente
                  </span>
                  <span className="block text-xs text-neutral-500">
                    Para quem emite pra empresa e identifica o cliente pelo CNPJ. Quem atende pessoa
                    física costuma querer o telefone no papel.
                  </span>
                </span>
              </label>

              <p className="text-xs text-neutral-500">
                Nome no recibo, CPF/CNPJ e endereço do cliente saem quando estão preenchidos na ficha
                dele — o nome e o CPF/CNPJ dá pra digitar na hora de enviar o recibo.
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
