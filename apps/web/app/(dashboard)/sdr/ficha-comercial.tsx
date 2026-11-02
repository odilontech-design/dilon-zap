"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { chamar, fetcher } from "../receber/formatos";
import {
  botaoPrimario,
  botaoSecundario,
  campo,
  COR_ETAPA,
  dataCurta,
  dataHora,
  dataParaIso,
  ETAPAS_COM_INTERESSE,
  ETAPAS_DE_RESPOSTA,
  formatarTelefone,
  isoParaData,
  maisDias,
  ROTULO_CANAL,
  ROTULO_ETAPA,
  ROTULO_FINALIDADE,
  ROTULO_PRIORIDADE,
  ROTULO_PRODUTO,
  ROTULO_TIPO_INTERACAO,
  rotulo,
  type EtapaComercial,
} from "./formatos-sdr";

type Acomp = {
  produto: string | null;
  prioridade: string;
  etapa: EtapaComercial;
  decisorNome: string | null;
  decisorCargo: string | null;
  decisorEmail: string | null;
  decisorTelefone: string | null;
  decisorLinkedin: string | null;
  observacoes: string | null;
  proximaAcao: string | null;
  proximaAcaoEm: string | null;
  ultimoContatoEm: string | null;
  negociacaoId: string | null;
};
type Abordagem = {
  id: string;
  produto: string;
  canal: "EMAIL" | "LIGACAO" | "MENSAGEM" | "OUTRO";
  finalidade: string;
  assunto: string | null;
  texto: string;
  versao: number;
  status: "RASCUNHO" | "APROVADA" | "REJEITADA";
  origem: string;
  aprovadaEm: string | null;
  aprovadaPorNome: string | null;
  textoAprovado: string | null;
  contatoEm?: string | null;
};
type Interacao = { id: string; tipo: string; canal: string | null; resultado: string | null; texto: string | null; autorNome: string | null; createdAt: string };
type Ficha = { acompanhamento: Acomp; abordagens: Abordagem[]; interacoes: Interacao[]; podeContatar: boolean };

export type DadosDaEmpresa = {
  id: string;
  nome: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  email: string | null;
  telefone: string | null;
  site: string | null;
  cidade: string | null;
  uf: string | null;
  segmento: string | null;
};

const secao = "rounded-md border border-neutral-200 p-3 flex flex-col gap-3";
const titulo = "text-sm font-semibold";
const input = "w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5 text-sm";

/** A parte comercial da ficha: tudo para prospectar a empresa sem sair daqui. */
export function FichaComercial({ empresa, podeEscrever, aoMudar }: { empresa: DadosDaEmpresa; podeEscrever: boolean; aoMudar: () => void }) {
  const { data, error, mutate } = useSWR<Ficha>(`/api/sdr/empresas/${empresa.id}/comercial`, fetcher);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro" | "atencao"; texto: string } | null>(null);
  const atualizar = () => {
    mutate();
    aoMudar();
  };
  const falhou = (erro?: string) => setAviso({ tipo: "erro", texto: erro ?? "não deu pra concluir" });

  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Carregando a ficha comercial...</p>;
  const a = data.acompanhamento;
  const leitura = !podeEscrever;

  return (
    <div className="flex flex-col gap-4">
      {aviso && (
        <p className={`rounded-md px-3 py-2 text-sm ${aviso.tipo === "erro" ? "bg-red-50 text-red-700" : aviso.tipo === "atencao" ? "bg-amber-50 text-amber-800" : "bg-accent/5 text-accent"}`} role="status">
          {aviso.texto}
        </p>
      )}
      {!data.podeContatar && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Esta empresa está na lista de bloqueio ou pediu para não ser contatada. Nenhuma abordagem pode ser aprovada nem registrada.</p>
      )}

      <Resumo a={a} leitura={leitura} id={empresa.id} podeConverter={ETAPAS_COM_INTERESSE.includes(a.etapa) && !a.negociacaoId && data.podeContatar} atualizar={atualizar} setAviso={setAviso} falhou={falhou} />
      <Decisor empresa={empresa} a={a} leitura={leitura} atualizar={atualizar} setAviso={setAviso} falhou={falhou} />
      <Abordagens empresa={empresa} a={a} abordagens={data.abordagens} podeContatar={data.podeContatar} leitura={leitura} atualizar={atualizar} setAviso={setAviso} falhou={falhou} />
      <Resposta id={empresa.id} a={a} leitura={leitura || !data.podeContatar} atualizar={atualizar} setAviso={setAviso} falhou={falhou} />
      <Historico interacoes={data.interacoes} id={empresa.id} leitura={leitura} atualizar={atualizar} falhou={falhou} />
      {!leitura && <EditarEmpresa empresa={empresa} atualizar={atualizar} setAviso={setAviso} falhou={falhou} />}
    </div>
  );
}

type Comuns = { atualizar: () => void; setAviso: (a: { tipo: "ok" | "erro" | "atencao"; texto: string } | null) => void; falhou: (e?: string) => void };

function Resumo({ a, leitura, id, podeConverter, atualizar, setAviso, falhou }: { a: Acomp; leitura: boolean; id: string; podeConverter: boolean } & Comuns) {
  const [produto, setProduto] = useState(a.produto ?? "");
  const [prioridade, setPrioridade] = useState(a.prioridade);
  const [proximaAcao, setProximaAcao] = useState(a.proximaAcao ?? "");
  const [data, setData] = useState(isoParaData(a.proximaAcaoEm));
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    const r = await chamar(`/api/sdr/empresas/${id}/comercial`, "PUT", { produto: produto || null, prioridade, proximaAcao: proximaAcao || null, proximaAcaoEm: data ? dataParaIso(data) : null });
    setSalvando(false);
    if (!r.ok) return falhou(r.erro);
    setAviso({ tipo: "ok", texto: "Salvo." });
    atualizar();
  }
  async function converter() {
    setAviso(null);
    const r = await chamar(`/api/sdr/empresas/${id}/converter`, "POST");
    if (!r.ok) return falhou(r.erro);
    setAviso({ tipo: "ok", texto: "Negociação criada no funil Prospecção ativa do CRM." });
    atualizar();
  }

  return (
    <section className={secao}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={titulo}>Situação comercial</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs ${COR_ETAPA[a.etapa]}`}>{ROTULO_ETAPA[a.etapa]}</span>
        {a.ultimoContatoEm && <span className="text-xs text-neutral-500">último contato registrado: {dataHora(a.ultimoContatoEm)}</span>}
        {a.negociacaoId && <span className="text-xs text-neutral-500">negociação no CRM criada</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label>
          <span className={rotulo}>Produto</span>
          <select id="comercial-produto" disabled={leitura} value={produto} onChange={(e) => setProduto(e.target.value)} className={input}>
            <option value="">Escolher…</option>
            {Object.entries(ROTULO_PRODUTO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={rotulo}>Prioridade</span>
          <select id="comercial-prioridade" disabled={leitura} value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className={input}>
            {Object.entries(ROTULO_PRIORIDADE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className={rotulo}>Próxima ação</span>
          <input id="comercial-proxima-acao" disabled={leitura} value={proximaAcao} onChange={(e) => setProximaAcao(e.target.value)} maxLength={300} placeholder="Ex.: ligar para o gerente de operações" className={input} />
        </label>
        <label>
          <span className={rotulo}>Data da próxima ação</span>
          <input id="comercial-data" type="date" disabled={leitura} value={data} onChange={(e) => setData(e.target.value)} className={input} />
        </label>
      </div>
      {!leitura && (
        <div className="flex flex-wrap items-center gap-2">
          <button id="comercial-salvar-resumo" onClick={salvar} disabled={salvando} className={botaoSecundario}>
            Salvar situação
          </button>
          {podeConverter && (
            <button id="comercial-converter" onClick={converter} className={botaoPrimario}>
              Enviar ao CRM (funil Prospecção ativa)
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Decisor({ empresa, a, leitura, atualizar, setAviso, falhou }: { empresa: DadosDaEmpresa; a: Acomp; leitura: boolean } & Comuns) {
  const [f, setF] = useState({ decisorNome: a.decisorNome ?? "", decisorCargo: a.decisorCargo ?? "", decisorEmail: a.decisorEmail ?? "", decisorTelefone: a.decisorTelefone ? formatarTelefone(a.decisorTelefone) : "", decisorLinkedin: a.decisorLinkedin ?? "", observacoes: a.observacoes ?? "" });
  const troca = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function salvar() {
    setAviso(null);
    const r = await chamar(`/api/sdr/empresas/${empresa.id}/comercial`, "PUT", Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])));
    if (!r.ok) return falhou(r.erro);
    setAviso({ tipo: "ok", texto: "Decisor e observações salvos." });
    atualizar();
  }

  return (
    <section className={secao}>
      <h3 className={titulo}>Decisor</h3>
      <p className="text-[11px] text-neutral-500">Preencha só o que você confirmou. O sistema não pesquisa nem acessa o LinkedIn: cole aqui o endereço do perfil, se já tiver.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={rotulo}>Nome</span>
          <input id="decisor-nome" disabled={leitura} value={f.decisorNome} onChange={troca("decisorNome")} maxLength={120} className={input} />
        </label>
        <label>
          <span className={rotulo}>Cargo</span>
          <input id="decisor-cargo" disabled={leitura} value={f.decisorCargo} onChange={troca("decisorCargo")} maxLength={120} className={input} />
        </label>
        <label>
          <span className={rotulo}>E-mail corporativo</span>
          <input id="decisor-email" type="email" disabled={leitura} value={f.decisorEmail} onChange={troca("decisorEmail")} maxLength={254} className={input} />
        </label>
        <label>
          <span className={rotulo}>Telefone corporativo</span>
          <input id="decisor-telefone" disabled={leitura} value={f.decisorTelefone} onChange={troca("decisorTelefone")} maxLength={40} className={input} />
        </label>
        <label className="sm:col-span-2">
          <span className={rotulo}>LinkedIn (endereço do perfil)</span>
          <input id="decisor-linkedin" disabled={leitura} value={f.decisorLinkedin} onChange={troca("decisorLinkedin")} maxLength={300} placeholder="https://www.linkedin.com/in/…" className={input} />
        </label>
        <label className="sm:col-span-2">
          <span className={rotulo}>Observações comerciais</span>
          <textarea id="decisor-observacoes" disabled={leitura} value={f.observacoes} onChange={troca("observacoes")} rows={2} maxLength={4000} className={campo} />
        </label>
      </div>
      {!leitura && (
        <button id="decisor-salvar" onClick={salvar} className={`${botaoSecundario} self-start`}>
          Salvar decisor
        </button>
      )}
    </section>
  );
}

function Abordagens({ empresa, a, abordagens, podeContatar, leitura, atualizar, setAviso, falhou }: { empresa: DadosDaEmpresa; a: Acomp; abordagens: Abordagem[]; podeContatar: boolean; leitura: boolean } & Comuns) {
  const [produto, setProduto] = useState(a.produto ?? "DILON_ZAP");
  const [problema, setProblema] = useState("");
  const [gerando, setGerando] = useState(false);
  const [sugestao, setSugestao] = useState<{ proximaAcao: string; faltantes: string[] } | null>(null);
  const bloqueado = leitura || !podeContatar;

  async function gerar() {
    setAviso(null);
    setGerando(true);
    const r = await chamar(`/api/sdr/empresas/${empresa.id}/abordagens/gerar`, "POST", { produto, problema: problema.trim() || null });
    setGerando(false);
    if (!r.ok) return falhou(r.erro);
    const d = r.dados as { ok: boolean; mensagem?: string; proximaAcao?: string; informacoesFaltantes?: string[]; origem?: string };
    if (!d.ok) {
      setAviso({ tipo: "atencao", texto: `A IA não gerou a abordagem: ${d.mensagem}. Use o modelo neutro ou escreva a abordagem à mão.` });
      return;
    }
    setSugestao({ proximaAcao: d.proximaAcao ?? "", faltantes: d.informacoesFaltantes ?? [] });
    setAviso({ tipo: "ok", texto: `Rascunhos criados${d.origem === "cache" ? " (resposta guardada, sem custo)" : ""}. Leia, edite e aprove antes de usar.` });
    atualizar();
  }
  async function criar(canal: string, modelo: boolean) {
    setAviso(null);
    const r = await chamar(`/api/sdr/empresas/${empresa.id}/abordagens`, "POST", { produto, canal, modelo, texto: modelo ? "modelo" : "Escreva aqui a sua abordagem." });
    if (!r.ok) return falhou(r.erro);
    atualizar();
  }

  return (
    <section className={secao}>
      <h3 className={titulo}>Abordagem</h3>
      {!leitura && podeContatar && (
        <div className="flex flex-col gap-2 rounded-md bg-neutral-50 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label>
              <span className={rotulo}>Produto</span>
              <select id="abordagem-produto" value={produto} onChange={(e) => setProduto(e.target.value)} className={input}>
                {Object.entries(ROTULO_PRODUTO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[220px] flex-1">
              <span className={rotulo}>Problema que queremos resolver (opcional)</span>
              <input id="abordagem-problema" value={problema} onChange={(e) => setProblema(e.target.value)} maxLength={500} placeholder="Ex.: comprovar a execução dos serviços em vários contratos" className={input} />
            </label>
            <button id="abordagem-gerar" onClick={gerar} disabled={gerando} className={botaoPrimario}>
              {gerando ? "Gerando…" : "Gerar abordagem personalizada"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
            <span>Sem IA:</span>
            <button id="abordagem-modelo-email" onClick={() => criar("EMAIL", true)} className="text-accent hover:underline">
              modelo neutro de e-mail
            </button>
            <button id="abordagem-modelo-ligacao" onClick={() => criar("LIGACAO", true)} className="text-accent hover:underline">
              modelo de roteiro de ligação
            </button>
            <button id="abordagem-manual" onClick={() => criar("EMAIL", false)} className="text-accent hover:underline">
              escrever à mão
            </button>
          </div>
        </div>
      )}
      {sugestao && (
        <div className="rounded-md bg-accent/5 px-3 py-2 text-xs text-neutral-700">
          <p>
            <strong>Próxima ação sugerida:</strong> {sugestao.proximaAcao}
          </p>
          {sugestao.faltantes.length > 0 && (
            <p className="mt-1">
              <strong>A IA precisou de mais dados:</strong> {sugestao.faltantes.join("; ")}
            </p>
          )}
        </div>
      )}
      {abordagens.length === 0 && <p className="text-sm text-neutral-500">Nenhuma abordagem ainda.</p>}
      {abordagens.map((ab) => (
        <CartaoDeAbordagem key={`${ab.id}-${ab.versao}`} ab={ab} empresa={empresa} a={a} bloqueado={bloqueado} atualizar={atualizar} setAviso={setAviso} falhou={falhou} />
      ))}
    </section>
  );
}

function CartaoDeAbordagem({ ab, empresa, a, bloqueado, atualizar, setAviso, falhou }: { ab: Abordagem; empresa: DadosDaEmpresa; a: Acomp; bloqueado: boolean } & Comuns) {
  const [texto, setTexto] = useState(ab.texto);
  const [assunto, setAssunto] = useState(ab.assunto ?? "");
  const [registrando, setRegistrando] = useState(false);
  const [canal, setCanal] = useState<string>(ab.canal);
  const [resultado, setResultado] = useState("");
  const [seguimento, setSeguimento] = useState(maisDias(3));
  const sujo = texto !== ab.texto || (ab.canal === "EMAIL" && (assunto || null) !== (ab.assunto ?? null));
  const aprovada = ab.status === "APROVADA";
  const emailDestino = a.decisorEmail ?? empresa.email;
  const telefoneDestino = a.decisorTelefone ?? empresa.telefone;

  async function agir(url: string, metodo: string, corpo?: unknown, mensagem?: string) {
    setAviso(null);
    const r = await chamar(url, metodo, corpo);
    if (!r.ok) return falhou(r.erro);
    if (mensagem) setAviso({ tipo: "ok", texto: mensagem });
    atualizar();
  }
  async function copiar() {
    try {
      await navigator.clipboard.writeText(ab.assunto ? `Assunto: ${ab.assunto}\n\n${ab.texto}` : ab.texto);
      setAviso({ tipo: "atencao", texto: "Texto copiado. Isso não envia nada: depois de enviar, clique em “Registrei que fiz o contato”." });
    } catch {
      setAviso({ tipo: "erro", texto: "O navegador não deixou copiar. Selecione o texto e copie à mão." });
    }
  }
  const mailto = emailDestino ? `mailto:${emailDestino}?subject=${encodeURIComponent(ab.assunto ?? "")}&body=${encodeURIComponent(ab.texto)}` : null;

  return (
    <div className={`rounded-md border p-3 flex flex-col gap-2 ${aprovada ? "border-accent" : "border-neutral-200"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">
          {ROTULO_CANAL[ab.canal]} · {ROTULO_FINALIDADE[ab.finalidade] ?? ab.finalidade}
        </span>
        <span className="text-neutral-500">{ROTULO_PRODUTO[ab.produto]}</span>
        <span className={`rounded-full px-2 py-0.5 ${aprovada ? "bg-accent/10 text-accent" : "bg-amber-100 text-amber-800"}`}>{aprovada ? "Aprovada" : "Aguardando aprovação"}</span>
        <span className="text-neutral-400">versão {ab.versao} · {ab.origem === "IA" ? "gerada por IA" : "escrita à mão"}</span>
        {aprovada && ab.aprovadaEm && (
          <span className="text-neutral-500">
            aprovada por {ab.aprovadaPorNome} em {dataHora(ab.aprovadaEm)}
          </span>
        )}
      </div>
      {ab.canal === "EMAIL" && (
        <input id={`ab-assunto-${ab.id}`} disabled={bloqueado} value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={200} placeholder="Assunto" aria-label="Assunto" className={input} />
      )}
      <textarea id={`ab-texto-${ab.id}`} disabled={bloqueado} value={texto} onChange={(e) => setTexto(e.target.value)} rows={Math.min(14, Math.max(5, texto.split("\n").length + 1))} maxLength={6000} aria-label="Texto da abordagem" className={campo} />
      {sujo && !bloqueado && <p className="text-[11px] text-amber-700">Texto alterado. {aprovada ? "Salvar derruba a aprovação: será preciso aprovar de novo." : "Salve para poder aprovar."}</p>}

      {!bloqueado && (
        <div className="flex flex-wrap items-center gap-2">
          {sujo && (
            <button id={`ab-salvar-${ab.id}`} onClick={() => agir(`/api/sdr/abordagens/${ab.id}`, "PATCH", { texto, assunto: ab.canal === "EMAIL" ? assunto || null : null }, "Texto salvo. Aprove para poder usar.")} className={botaoSecundario}>
              Salvar edição
            </button>
          )}
          {!aprovada && !sujo && (
            <button id={`ab-aprovar-${ab.id}`} onClick={() => agir(`/api/sdr/abordagens/${ab.id}/aprovar`, "POST", undefined, "Abordagem aprovada. Agora você pode copiá-la ou abri-la no seu e-mail.")} className={botaoPrimario}>
              Aprovar
            </button>
          )}
          <button id={`ab-rejeitar-${ab.id}`} onClick={() => agir(`/api/sdr/abordagens/${ab.id}/rejeitar`, "POST", undefined, "Abordagem rejeitada.")} className="text-xs text-neutral-500 hover:text-red-600">
            Rejeitar
          </button>
        </div>
      )}

      {aprovada && !sujo && (
        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <button id={`ab-copiar-${ab.id}`} onClick={copiar} className={botaoSecundario}>
              Copiar texto
            </button>
            {mailto && ab.canal === "EMAIL" && (
              <a id={`ab-mailto-${ab.id}`} href={mailto} className={botaoSecundario}>
                Abrir no meu e-mail
              </a>
            )}
            {telefoneDestino && ab.canal === "LIGACAO" && (
              <a href={`tel:+${telefoneDestino}`} className={botaoSecundario}>
                Ligar para {formatarTelefone(telefoneDestino)}
              </a>
            )}
            {!bloqueado && !registrando && (
              <button id={`ab-registrar-${ab.id}`} onClick={() => setRegistrando(true)} className={botaoPrimario}>
                Registrei que fiz o contato
              </button>
            )}
          </div>
          <p className="text-[11px] text-neutral-500">O Dilon Zap não envia esta mensagem. Você envia pelo seu canal e depois registra aqui.</p>
          {registrando && (
            <div className="grid gap-2 rounded-md bg-neutral-50 p-3 sm:grid-cols-3">
              <label>
                <span className={rotulo}>Canal usado</span>
                <select id={`ab-canal-${ab.id}`} value={canal} onChange={(e) => setCanal(e.target.value)} className={input}>
                  {Object.entries(ROTULO_CANAL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className={rotulo}>Resultado (opcional)</span>
                <input id={`ab-resultado-${ab.id}`} value={resultado} onChange={(e) => setResultado(e.target.value)} maxLength={300} placeholder="Ex.: ligou, caiu na caixa postal" className={input} />
              </label>
              <label>
                <span className={rotulo}>Fazer follow-up em</span>
                <input id={`ab-followup-${ab.id}`} type="date" value={seguimento} onChange={(e) => setSeguimento(e.target.value)} className={input} />
              </label>
              <div className="flex items-end gap-2 sm:col-span-2">
                <button
                  id={`ab-confirmar-${ab.id}`}
                  onClick={() => {
                    setRegistrando(false);
                    return agir(`/api/sdr/abordagens/${ab.id}/contato`, "POST", { canal, resultado: resultado.trim() || null, proximaAcaoEm: seguimento ? dataParaIso(seguimento) : null, proximaAcao: seguimento ? "Fazer follow-up" : null }, "Contato registrado. A empresa agora aguarda resposta.");
                  }}
                  className={botaoPrimario}
                >
                  Confirmar contato realizado
                </button>
                <button onClick={() => setRegistrando(false)} className="text-xs text-neutral-500">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Resposta({ id, a, leitura, atualizar, setAviso, falhou }: { id: string; a: Acomp; leitura: boolean } & Comuns) {
  const [etapa, setEtapa] = useState<EtapaComercial>("RESPONDEU");
  const [nota, setNota] = useState("");
  const [data, setData] = useState("");
  const encerra = etapa === "SEM_INTERESSE" || etapa === "NAO_CONTATAR";

  async function registrar() {
    setAviso(null);
    if (etapa === "NAO_CONTATAR" && !window.confirm("A empresa e os contatos dela irão para a lista de bloqueio e as abordagens pendentes serão rejeitadas. Continuar?")) return;
    const r = await chamar(`/api/sdr/empresas/${id}/resultado`, "POST", { etapa, nota: nota.trim() || null, ...(encerra ? {} : data ? { proximaAcaoEm: dataParaIso(data) } : {}) });
    if (!r.ok) return falhou(r.erro);
    setNota("");
    setData("");
    setAviso({ tipo: "ok", texto: etapa === "NAO_CONTATAR" ? "Registrado. A empresa foi para a lista de bloqueio e os follow-ups foram encerrados." : "Registrado." });
    atualizar();
  }

  if (a.etapa === "CONVERTIDA") return null;
  return (
    <section className={secao}>
      <h3 className={titulo}>Resposta e follow-up</h3>
      {leitura ? (
        <p className="text-sm text-neutral-500">Sem permissão para registrar.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className={rotulo}>O que aconteceu</span>
            <select id="resposta-etapa" value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaComercial)} className={input}>
              {ETAPAS_DE_RESPOSTA.map((e) => (
                <option key={e} value={e}>
                  {ROTULO_ETAPA[e]}
                </option>
              ))}
            </select>
          </label>
          {!encerra && (
            <label>
              <span className={rotulo}>Próximo follow-up em</span>
              <input id="resposta-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={input} />
            </label>
          )}
          <label className="sm:col-span-3">
            <span className={rotulo}>Nota (opcional)</span>
            <input id="resposta-nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={2000} placeholder="O que a pessoa disse" className={input} />
          </label>
          <div className="sm:col-span-3">
            <button id="resposta-registrar" onClick={registrar} className={botaoSecundario}>
              Registrar
            </button>
            {encerra && <span className="ml-2 text-[11px] text-neutral-500">{etapa === "NAO_CONTATAR" ? "Vai para a lista de bloqueio." : "Encerra os follow-ups."}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function Historico({ interacoes, id, leitura, atualizar, falhou }: { interacoes: Interacao[]; id: string; leitura: boolean; atualizar: () => void; falhou: (e?: string) => void }) {
  const [nota, setNota] = useState("");
  async function salvar() {
    if (!nota.trim()) return;
    const r = await chamar(`/api/sdr/empresas/${id}/notas`, "POST", { texto: nota.trim() });
    if (!r.ok) return falhou(r.erro);
    setNota("");
    atualizar();
  }
  return (
    <section className={secao}>
      <h3 className={titulo}>Histórico</h3>
      {!leitura && (
        <div className="flex gap-2">
          <input id="historico-nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={4000} placeholder="Anotar algo sobre esta empresa" className={input} />
          <button id="historico-anotar" onClick={salvar} className={botaoSecundario}>
            Anotar
          </button>
        </div>
      )}
      {interacoes.length === 0 && <p className="text-sm text-neutral-500">Nada registrado ainda.</p>}
      <ul className="flex flex-col gap-1.5">
        {interacoes.map((i) => (
          <li key={i.id} className="text-xs">
            <span className="text-neutral-400">{dataHora(i.createdAt)}</span> · <strong className="font-medium">{ROTULO_TIPO_INTERACAO[i.tipo] ?? i.tipo}</strong>
            {i.canal ? ` (${ROTULO_CANAL[i.canal] ?? i.canal})` : ""}
            {i.resultado ? ` — ${ROTULO_ETAPA[i.resultado as EtapaComercial] ?? i.resultado}` : ""}
            {i.autorNome ? <span className="text-neutral-400"> · {i.autorNome}</span> : null}
            {i.texto && i.tipo !== "CONTATO" && <p className="text-neutral-600">{i.texto}</p>}
            {i.texto && i.tipo === "CONTATO" && <p className="whitespace-pre-wrap text-neutral-500 line-clamp-3">{i.texto}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EditarEmpresa({ empresa, atualizar, setAviso, falhou }: { empresa: DadosDaEmpresa } & Comuns) {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({
    nomeFantasia: empresa.nomeFantasia ?? "",
    razaoSocial: empresa.razaoSocial ?? "",
    site: empresa.site ?? "",
    email: empresa.email ?? "",
    telefone: empresa.telefone ? formatarTelefone(empresa.telefone) : "",
    cidade: empresa.cidade ?? "",
    uf: empresa.uf ?? "",
    segmento: empresa.segmento ?? "",
  });
  useEffect(() => {
    setAviso(null);
  }, [aberto, setAviso]);
  const troca = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function salvar() {
    const r = await chamar(`/api/sdr/empresas/${empresa.id}`, "PATCH", Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])));
    if (!r.ok) return falhou(r.erro);
    setAviso({ tipo: "ok", texto: "Dados da empresa atualizados." });
    atualizar();
  }
  return (
    <details open={aberto} onToggle={(e) => setAberto((e.target as HTMLDetailsElement).open)} className={secao}>
      <summary className="cursor-pointer text-sm font-semibold">Corrigir dados da empresa</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(
          [
            ["nomeFantasia", "Nome fantasia"],
            ["razaoSocial", "Razão social"],
            ["site", "Site"],
            ["email", "E-mail da empresa"],
            ["telefone", "Telefone da empresa"],
            ["cidade", "Cidade"],
            ["uf", "UF"],
            ["segmento", "Segmento"],
          ] as const
        ).map(([k, nome]) => (
          <label key={k}>
            <span className={rotulo}>{nome}</span>
            <input id={`empresa-${k}`} value={f[k]} onChange={troca(k)} maxLength={300} className={input} />
          </label>
        ))}
      </div>
      <button id="empresa-salvar" onClick={salvar} className={`${botaoSecundario} mt-3 self-start`}>
        Salvar dados da empresa
      </button>
    </details>
  );
}

export { dataCurta };
