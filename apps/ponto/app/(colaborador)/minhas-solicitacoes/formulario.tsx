"use client";

import { useRef, useState, useTransition } from "react";
import { AreaTexto, Botao, Campo, Entrada, Selecao } from "@/components/campos";
import { criarSolicitacao, marcacoesDoDia } from "@/lib/solicitacoes";
import { TIPOS_SOLICITACAO, type TipoSolicitacao } from "@/lib/solicitacoes-regras";

export function FormularioSolicitacao({ hoje }: { hoje: string }) {
  const [tipo, setTipo] = useState<TipoSolicitacao>("INCLUSAO");
  const [data, setData] = useState(hoje);
  const [marcacoes, setMarcacoes] = useState<Array<{ id: string; hora: string; nsr: number }> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pendente, iniciar] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  function carregarMarcacoes(dia: string) {
    setMarcacoes(null);
    iniciar(async () => {
      const r = await marcacoesDoDia(dia);
      if (r.ok) setMarcacoes(r.dados ?? []);
      else setErro(r.erro);
    });
  }

  function mudarTipo(t: TipoSolicitacao) {
    setTipo(t);
    setErro(null);
    if (t === "DESCONSIDERACAO") carregarMarcacoes(data);
  }

  function mudarData(d: string) {
    setData(d);
    if (tipo === "DESCONSIDERACAO" && d) carregarMarcacoes(d);
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setOk(false);
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await criarSolicitacao(dados);
      if (!r.ok) return setErro(r.erro);
      setOk(true);
      form.current?.reset();
      setTipo("INCLUSAO");
      setData(hoje);
    });
  }

  return (
    <form ref={form} onSubmit={enviar} className="space-y-3">
      <Campo rotulo="O que você precisa?">
        <Selecao name="tipo" value={tipo} onChange={(e) => mudarTipo(e.target.value as TipoSolicitacao)}>
          {Object.entries(TIPOS_SOLICITACAO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Selecao>
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo={tipo === "ATESTADO" ? "Primeiro dia" : "Dia"}>
          <Entrada type="date" name="data" required value={data} max={tipo === "ATESTADO" ? undefined : hoje} onChange={(e) => mudarData(e.target.value)} />
        </Campo>
        {tipo === "ATESTADO" && (
          <Campo rotulo="Último dia">
            <Entrada type="date" name="dataFim" min={data} defaultValue={data} />
          </Campo>
        )}
        {tipo === "INCLUSAO" && (
          <Campo rotulo="Horário que faltou">
            <Entrada type="time" name="hora" required />
          </Campo>
        )}
        {tipo === "ABONO" && (
          <Campo rotulo="Horas a abonar" ajuda="Ex.: 2:30">
            <Entrada name="duracao" required placeholder="2:30" inputMode="numeric" />
          </Campo>
        )}
      </div>

      {tipo === "INCLUSAO" && (
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="diaSeguinte" value="1" /> Foi depois da meia-noite (turno da noite)
        </label>
      )}

      {tipo === "DESCONSIDERACAO" && (
        <Campo rotulo="Qual marcação?">
          {marcacoes == null ? (
            <p className="text-sm text-neutral-500">Carregando…</p>
          ) : marcacoes.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhuma marcação nesse dia.</p>
          ) : (
            <Selecao name="marcacaoId" required>
              {marcacoes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.hora} · NSR {m.nsr}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
      )}

      <Campo rotulo="Motivo">
        <AreaTexto name="justificativa" required minLength={5} rows={3} placeholder="Ex.: o celular descarregou na saída" />
      </Campo>

      <Campo rotulo={tipo === "ATESTADO" ? "Foto ou PDF do atestado" : "Anexo (opcional)"} ajuda="PDF ou foto, até 4 MB.">
        <input type="file" name="anexo" accept="application/pdf,image/jpeg,image/png,image/webp" capture={undefined} required={tipo === "ATESTADO"} className="block w-full text-sm text-neutral-700" />
      </Campo>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {ok && <p className="text-sm text-emerald-600">Solicitação enviada. Você acompanha a resposta aqui.</p>}
      <Botao type="submit" disabled={pendente} className="w-full">
        {pendente ? "Enviando…" : "Enviar solicitação"}
      </Botao>
    </form>
  );
}

export function BotaoCancelar({ id, cancelar }: { id: string; cancelar: (id: string) => Promise<{ ok: boolean; erro?: string }> }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button disabled={pendente} className="text-xs text-red-600" onClick={() => iniciar(async () => void (await cancelar(id)))}>
      cancelar
    </button>
  );
}
