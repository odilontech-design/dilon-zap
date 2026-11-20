"use client";

import { useState, useTransition } from "react";
import { Botao, Campo, Entrada, Selecao } from "@/components/campos";
import { dataBr } from "@/lib/datas";
import { adicionarFeriado, carregarFeriadosNacionais, removerFeriado, salvarConfiguracoes } from "./acoes";

type Config = Parameters<typeof salvarConfiguracoes>[0];

const FUSOS: Array<[string, string]> = [
  ["America/Sao_Paulo", "Brasília (SP, RJ, MG, Sul, GO, DF)"],
  ["America/Bahia", "Bahia"],
  ["America/Fortaleza", "Nordeste (CE, RN, PB, PI, MA)"],
  ["America/Recife", "Pernambuco"],
  ["America/Belem", "Pará e Amapá"],
  ["America/Manaus", "Amazonas"],
  ["America/Cuiaba", "Mato Grosso"],
  ["America/Campo_Grande", "Mato Grosso do Sul"],
  ["America/Porto_Velho", "Rondônia"],
  ["America/Boa_Vista", "Roraima"],
  ["America/Rio_Branco", "Acre"],
  ["America/Noronha", "Fernando de Noronha"],
];

export function FormularioConfiguracoes({ inicial, cnpj }: { inicial: Config; cnpj: string }) {
  const [f, setF] = useState(inicial);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const num = (k: keyof Config, fator = 1) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: Math.round(Number(e.target.value.replace(",", ".")) * fator) });

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await salvarConfiguracoes(f);
      setMsg(r.ok ? { ok: true, texto: "Configurações salvas. O espelho já recalcula com as novas regras." } : { ok: false, texto: r.erro });
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-5">
      <div>
        <p className="font-semibold text-neutral-900 mb-3">Empresa</p>
        <div className="grid md:grid-cols-2 gap-3">
          <Campo rotulo="Razão social">
            <Entrada value={f.razaoSocial} onChange={(e) => setF({ ...f, razaoSocial: e.target.value })} />
          </Campo>
          <Campo rotulo="Nome fantasia">
            <Entrada value={f.nomeFantasia ?? ""} onChange={(e) => setF({ ...f, nomeFantasia: e.target.value })} />
          </Campo>
          <Campo rotulo="CNPJ" ajuda="O plano Essencial cobre 1 CNPJ.">
            <Entrada value={cnpj} disabled />
          </Campo>
          <Campo rotulo="Fuso horário" ajuda="A hora do ponto e o dia de trabalho seguem este fuso.">
            <Selecao value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value as Config["timezone"] })}>
              {FUSOS.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>
        <label className="flex gap-2 text-sm text-neutral-700 mt-3">
          <input type="checkbox" checked={f.exigirLocalizacao} onChange={(e) => setF({ ...f, exigirLocalizacao: e.target.checked })} />
          Pedir a localização (GPS) a cada marcação. Sem ela, a marcação é registrada e fica para conferência.
        </label>
      </div>

      <div>
        <p className="font-semibold text-neutral-900 mb-1">Regras de cálculo</p>
        <p className="text-xs text-neutral-500 mb-3">Já vêm com o padrão da CLT. Ajuste se a convenção coletiva da sua categoria disser diferente.</p>
        <div className="grid md:grid-cols-3 gap-3">
          <Campo rotulo="Tolerância por marcação (min)" ajuda="CLT: 5">
            <Entrada type="number" min={0} max={10} value={f.toleranciaPorMarcacaoMin} onChange={num("toleranciaPorMarcacaoMin")} />
          </Campo>
          <Campo rotulo="Tolerância no dia (min)" ajuda="CLT: 10">
            <Entrada type="number" min={0} max={20} value={f.toleranciaDiariaMin} onChange={num("toleranciaDiariaMin")} />
          </Campo>
          <Campo rotulo="Hora extra (%)" ajuda="Mínimo legal: 50%">
            <Entrada type="number" min={50} value={f.percentualExtraBp / 100} onChange={num("percentualExtraBp", 100)} />
          </Campo>
          <Campo rotulo="Domingo/feriado/folga (%)" ajuda="Usual: 100%">
            <Entrada type="number" min={50} value={f.percentualDescansoBp / 100} onChange={num("percentualDescansoBp", 100)} />
          </Campo>
          <Campo rotulo="Adicional noturno (%)" ajuda="Urbano: 20%">
            <Entrada type="number" min={20} value={f.percentualNoturnoBp / 100} onChange={num("percentualNoturnoBp", 100)} />
          </Campo>
        </div>
        <label className="flex gap-2 text-sm text-neutral-700 mt-4">
          <input type="checkbox" checked={f.bancoDeHoras} onChange={(e) => setF({ ...f, bancoDeHoras: e.target.checked })} />
          Usar banco de horas (extra de dia útil vira crédito; atraso e falta viram débito)
        </label>
        {f.bancoDeHoras && (
          <div className="mt-3 max-w-xs">
            <Campo rotulo="Validade de cada crédito (dias)" ajuda="Acordo individual: até 6 meses (180). Acordo coletivo: até 1 ano.">
              <Entrada type="number" min={1} max={366} value={f.validadeBancoDias} onChange={num("validadeBancoDias")} />
            </Campo>
          </div>
        )}
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.texto}</p>}
      <Botao type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar configurações"}
      </Botao>
    </form>
  );
}

export function Feriados({ ano, feriados }: { ano: number; feriados: Array<{ id: string; data: string; nome: string }> }) {
  const [data, setData] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const temProximoAno = feriados.some((f) => f.data.startsWith(String(ano + 1)));

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold text-neutral-900">Feriados</p>
        <p className="text-xs text-neutral-500">
          Os nacionais já vêm cadastrados. Inclua os estaduais e municipais da sua cidade (e o Carnaval, se for feriado aí).
        </p>
      </div>
      <ul className="divide-y divide-neutral-200 text-sm max-h-72 overflow-y-auto">
        {feriados.map((f) => (
          <li key={f.id} className="py-1.5 flex justify-between gap-2">
            <span>
              <span className="tabular-nums text-neutral-500">{dataBr(f.data)}</span> {f.nome}
            </span>
            <button
              disabled={pendente}
              onClick={() => iniciar(async () => void (await removerFeriado(f.id)))}
              className="text-xs text-red-600"
            >
              remover
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <Entrada type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-40" />
        <Entrada placeholder="Nome do feriado" value={nome} onChange={(e) => setNome(e.target.value)} className="w-56" />
        <Botao
          variante="secundario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await adicionarFeriado(data, nome);
              if (!r.ok) return setErro(r.erro);
              setErro(null);
              setData("");
              setNome("");
            })
          }
        >
          Adicionar
        </Botao>
        {!temProximoAno && (
          <Botao variante="secundario" disabled={pendente} onClick={() => iniciar(async () => void (await carregarFeriadosNacionais(ano + 1)))}>
            Carregar nacionais de {ano + 1}
          </Botao>
        )}
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
