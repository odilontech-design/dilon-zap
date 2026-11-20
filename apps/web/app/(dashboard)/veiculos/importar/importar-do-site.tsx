"use client";

import { useState } from "react";
import Link from "next/link";
import { botaoPrimario, brl, campo, erroDaResposta, rotulo, secao } from "../comum";

type Resultado = {
  site: string;
  encontrados: number;
  entram: number;
  jaNoEstoque: number;
  alemDoPlano: number;
  criados: number;
  semPreco: number;
  semKm: number;
  fotos: number;
  semDetalhe: number;
  previa: { nome: string; ano: string; cor: string | null; precoCents: number; kmInformado: boolean }[];
};

/**
 * Traz o estoque do site atual da loja: a pessoa digita o endereço, confere o
 * que entra e importa. Os carros chegam em preparação (o site costuma não
 * publicar preço, km e placa) e vão ao ar quando a ficha estiver completa.
 */
export function ImportarDoSite({ onFotos }: { onFotos: () => void }) {
  const [endereco, setEndereco] = useState("");
  const [conferido, setConferido] = useState<Resultado | null>(null);
  const [feito, setFeito] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(simular: boolean) {
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/veiculos/importar/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endereco, simular }) });
      if (!r.ok) {
        setErro(await erroDaResposta(r));
        return;
      }
      const d = (await r.json()) as Resultado;
      if (simular) {
        setConferido(d);
        setFeito(null);
      } else {
        setFeito(d);
        setConferido(null);
        if (d.fotos > 0) onFotos();
      }
    } finally {
      setOcupado(false);
    }
  }

  const r = feito ?? conferido;
  return (
    <div className="flex flex-col gap-4">
      <section className={secao}>
        <h2 className="text-sm font-semibold">Trazer o estoque do site atual</h2>
        <p className="text-xs text-neutral-500">
          Informe o endereço do site que a loja usa hoje. O Zap lê os carros, as fotos e os opcionais e cria as fichas. Funciona com sites feitos no AutoCerto; para os outros, use a
          planilha abaixo.
        </p>
        <label className="flex flex-col gap-1" htmlFor="site-endereco">
          <span className={rotulo}>Endereço do site</span>
          <input
            id="site-endereco"
            value={endereco}
            onChange={(e) => {
              setEndereco(e.target.value);
              setConferido(null);
              setFeito(null);
            }}
            placeholder="www.sualoja.com.br"
            className={campo}
            inputMode="url"
          />
        </label>
        <div>
          <button className={botaoPrimario} disabled={ocupado || endereco.trim().length < 3} onClick={() => enviar(true)}>
            {ocupado && !conferido && !feito ? "Lendo o site…" : "Conferir o que entra"}
          </button>
        </div>
        {erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{erro}</p>}
      </section>

      {r && (
        <section className={secao}>
          <h2 className="text-sm font-semibold">{feito ? "Importado" : "Conferência"}: {r.site}</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">
              {feito ? `${r.criados} carro(s) criado(s)` : `${r.entram} carro(s) entram`} de {r.encontrados} no site
            </span>
            {r.jaNoEstoque > 0 && <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{r.jaNoEstoque} já importado(s) antes</span>}
            {r.alemDoPlano > 0 && <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-700">{r.alemDoPlano} passam do limite do plano e ficam de fora</span>}
            {r.fotos > 0 && feito && <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">{r.fotos} foto(s) para baixar</span>}
          </div>
          {r.entram > 0 && (r.semPreco > 0 || r.semKm > 0) && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              O site não publica {r.semPreco > 0 ? `o preço (${r.semPreco} carro(s))` : ""}
              {r.semPreco > 0 && r.semKm > 0 ? " nem " : ""}
              {r.semKm > 0 ? `a quilometragem (${r.semKm} carro(s))` : ""}, nem a placa. Os carros entram <strong>em preparação</strong>, fora da vitrine, e só vão à venda quando você
              informar preço e km na ficha de cada um.
            </p>
          )}
          {feito && r.semDetalhe > 0 && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              {r.semDetalhe} carro(s) entraram só com a foto da capa, porque a página deles no site não abriu. Importe de novo mais tarde para tentar completar.
            </p>
          )}
          {r.previa.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="py-1 font-medium">Carro</th>
                  <th className="py-1 font-medium">Ano</th>
                  <th className="py-1 font-medium">Cor</th>
                  <th className="py-1 text-right font-medium">Preço</th>
                  <th className="py-1 text-right font-medium">Km</th>
                </tr>
              </thead>
              <tbody>
                {r.previa.map((p, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="py-1">{p.nome}</td>
                    <td className="py-1">{p.ano}</td>
                    <td className="py-1">{p.cor ?? "—"}</td>
                    <td className="py-1 text-right tabular-nums">{p.precoCents > 0 ? brl(p.precoCents) : <span className="text-amber-700">falta</span>}</td>
                    <td className="py-1 text-right">{p.kmInformado ? "ok" : <span className="text-amber-700">falta</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!feito && r.entram > 0 && (
            <div>
              <button className={botaoPrimario} disabled={ocupado} onClick={() => enviar(false)}>
                {ocupado ? "Importando…" : `Importar ${r.entram} carro(s)`}
              </button>
              <span className="ml-2 text-xs text-neutral-500">Leva alguns segundos: o Zap abre a página de cada carro.</span>
            </div>
          )}
          {feito && (
            <p className="text-sm">
              Próximo passo: abra cada carro em <Link href="/veiculos" className="text-accent hover:underline">Estoque</Link>, informe preço, km e placa e clique em “Pronto para vender”.
            </p>
          )}
        </section>
      )}

    </div>
  );
}
