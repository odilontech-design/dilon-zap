"use client";

import { useState, useTransition } from "react";
import { Botao, Campo, Entrada } from "@/components/campos";
import { salvarIdentificacaoRep } from "./acoes";

/** Identificação no registro de ponto: CPF do responsável, endereço e CNO/CAEPF. */
export function IdentificacaoRep({ inicial }: { inicial: { cpf: string; endereco: string; cnoOuCaepf: string } }) {
  const [f, setF] = useState(inicial);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await salvarIdentificacaoRep(f);
          setMsg(r.ok ? { ok: true, texto: "Identificação salva no registro de ponto." } : { ok: false, texto: r.erro });
        });
      }}
    >
      <div className="grid sm:grid-cols-2 gap-3 items-start">
        <Campo rotulo="Seu CPF" ajuda="Registrado como responsável pelas alterações de empresa e colaboradores.">
          <Entrada required inputMode="numeric" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} />
        </Campo>
        <Campo rotulo="CNO ou CAEPF" ajuda="Só se a empresa tiver. Deixe em branco se não tiver.">
          <Entrada inputMode="numeric" value={f.cnoOuCaepf} onChange={(e) => setF({ ...f, cnoOuCaepf: e.target.value })} />
        </Campo>
      </div>
      <Campo rotulo="Endereço do estabelecimento" ajuda="Sai no comprovante de cada marcação e no arquivo do registro de ponto.">
        <Entrada required maxLength={100} value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} placeholder="Rua, número, bairro, cidade/UF" />
      </Campo>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.texto}</p>}
      <Botao type="submit" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar identificação"}
      </Botao>
    </form>
  );
}

/** AFD e AEJ do período, para entregar ao Auditor-Fiscal do Trabalho. */
export function ArquivosFiscalizacao({ inicioPadrao, fimPadrao, assinado }: { inicioPadrao: string; fimPadrao: string; assinado: boolean }) {
  const [de, setDe] = useState(inicioPadrao);
  const [ate, setAte] = useState(fimPadrao);
  const q = `de=${de}&ate=${ate}`;
  const link = "text-sm text-accent hover:underline";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="De">
          <Entrada type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" />
        </Campo>
        <Campo rotulo="Até">
          <Entrada type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" />
        </Campo>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-neutral-200 p-3">
          <p className="font-medium text-neutral-900">AFD: Arquivo Fonte de Dados</p>
          <p className="text-xs text-neutral-500 mt-0.5">Todas as marcações e operações do registro, com NSR.</p>
          <div className="mt-2 flex gap-4">
            <a className={link} href={`/api/rep/afd?${q}`}>Baixar AFD</a>
            {assinado && <a className={link} href={`/api/rep/afd?${q}&formato=p7s`}>Assinatura (.p7s)</a>}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 p-3">
          <p className="font-medium text-neutral-900">AEJ: Arquivo Eletrônico de Jornada</p>
          <p className="text-xs text-neutral-500 mt-0.5">Jornada tratada: marcações, ajustes, ausências e banco de horas.</p>
          <div className="mt-2 flex gap-4">
            <a className={link} href={`/api/rep/aej?${q}`}>Baixar AEJ</a>
            {assinado && <a className={link} href={`/api/rep/aej?${q}&formato=p7s`}>Assinatura (.p7s)</a>}
          </div>
        </div>
      </div>
    </div>
  );
}
