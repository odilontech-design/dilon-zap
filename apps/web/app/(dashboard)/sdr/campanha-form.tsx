"use client";

import { useMemo, useRef, useState } from "react";
import { preencherModelo, valoresDoModelo, VARIAVEIS_DO_MODELO, variaveisDesconhecidas } from "@dilon-zap/sdr-core/src/modelos-de-campanha";
import { ROTULO_STATUS_CAMPANHA, STATUS_CAMPANHA } from "@/lib/sdr/esquemas";
import { chamar } from "../receber/formatos";

/**
 * Cadastro da campanha com o roteiro de venda: para quem é, o argumento, as ofertas, as objeções com resposta e os
 * modelos de mensagem de cada canal. O preparo da fila usa esses modelos; sem modelo num canal, vale o neutro.
 */

type Status = (typeof STATUS_CAMPANHA)[number];
type Objecao = { objecao: string; resposta: string };
export type CampanhaCompleta = {
  id: string;
  nome: string;
  descricao: string | null;
  status: Status;
  icp: { id: string; nome: string };
  produto?: "DILON_ZAP" | "DILON_FACILITIES" | null;
  metaDiaria?: number | null;
  publico?: string | null;
  argumento?: string | null;
  ofertas?: string | null;
  provaSocial?: string | null;
  objecoes?: Objecao[] | null;
  linkAgenda?: string | null;
  modeloWhatsapp?: string | null;
  modeloEmailAssunto?: string | null;
  modeloEmail?: string | null;
  modeloLigacao?: string | null;
  modeloDirect?: string | null;
};

type CanalDoModelo = "WHATSAPP" | "EMAIL" | "LIGACAO" | "MENSAGEM";
const CANAIS: { id: CanalDoModelo; nome: string; dica: string }[] = [
  { id: "LIGACAO", nome: "Ligação", dica: "Roteiro que você segue ao telefone. Não é enviado a ninguém." },
  { id: "EMAIL", nome: "E-mail", dica: "Sai pela caixa de e-mail do SDR, com o rodapé de descadastro." },
  { id: "MENSAGEM", nome: "Direct", dica: "Você copia e envia pelo Instagram. Curto: duas ou três frases." },
  { id: "WHATSAPP", nome: "WhatsApp", dica: "Aberto no Inbox, um por clique, dentro do limite diário. Use como último toque." },
];

const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm";
const rotulo = "block text-xs font-medium text-neutral-700 mb-1";
const ajuda = "mt-1 text-[11px] text-neutral-500";

const EXEMPLO = valoresDoModelo({ empresa: "Auto Center Exemplo", decisor: "Marcos Silva", autor: "Felipe", cidade: "Niterói", uf: "RJ", linkAgenda: "https://agenda.exemplo/demo", site: "https://autocenterexemplo.com.br", instagram: "https://instagram.com/autocenterexemplo" });

export function FormCampanha({ campanha, perfis, onFechar, onSalvo }: { campanha: CampanhaCompleta | null; perfis: { id: string; nome: string }[]; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(campanha?.nome ?? "");
  const [descricao, setDescricao] = useState(campanha?.descricao ?? "");
  const [icpId, setIcpId] = useState(campanha?.icp.id ?? perfis[0]?.id ?? "");
  const [status, setStatus] = useState<Status>(campanha?.status ?? "RASCUNHO");
  const [produto, setProduto] = useState<"" | "DILON_ZAP" | "DILON_FACILITIES">(campanha?.produto ?? "DILON_ZAP");
  const [metaDiaria, setMetaDiaria] = useState(String(campanha?.metaDiaria ?? 25));
  const [publico, setPublico] = useState(campanha?.publico ?? "");
  const [argumento, setArgumento] = useState(campanha?.argumento ?? "");
  const [ofertas, setOfertas] = useState(campanha?.ofertas ?? "");
  const [provaSocial, setProvaSocial] = useState(campanha?.provaSocial ?? "");
  const [linkAgenda, setLinkAgenda] = useState(campanha?.linkAgenda ?? "");
  const [objecoes, setObjecoes] = useState<Objecao[]>(Array.isArray(campanha?.objecoes) ? campanha.objecoes : []);
  const [modelos, setModelos] = useState<Record<CanalDoModelo, string>>({
    LIGACAO: campanha?.modeloLigacao ?? "",
    EMAIL: campanha?.modeloEmail ?? "",
    MENSAGEM: campanha?.modeloDirect ?? "",
    WHATSAPP: campanha?.modeloWhatsapp ?? "",
  });
  const [assuntoEmail, setAssuntoEmail] = useState(campanha?.modeloEmailAssunto ?? "");
  const [canal, setCanal] = useState<CanalDoModelo>("LIGACAO");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const caixa = useRef<HTMLTextAreaElement>(null);

  const desconhecidas = useMemo(() => [...new Set([...Object.values(modelos), assuntoEmail].flatMap(variaveisDesconhecidas))], [modelos, assuntoEmail]);
  const exemplo = { ...EXEMPLO, link_agenda: linkAgenda.trim() || EXEMPLO.link_agenda };

  function inserir(variavel: string) {
    const el = caixa.current;
    const atual = modelos[canal];
    const ini = el?.selectionStart ?? atual.length;
    const fim = el?.selectionEnd ?? atual.length;
    const novo = `${atual.slice(0, ini)}{${variavel}}${atual.slice(fim)}`;
    setModelos({ ...modelos, [canal]: novo });
    requestAnimationFrame(() => {
      el?.focus();
      const pos = ini + variavel.length + 2;
      el?.setSelectionRange(pos, pos);
    });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (desconhecidas.length) return setErro(`Variável desconhecida: ${desconhecidas.map((v) => `{${v}}`).join(", ")}.`);
    const meta = Number(metaDiaria);
    if (!Number.isInteger(meta) || meta < 1 || meta > 200) return setErro("A meta diária vai de 1 a 200 empresas.");
    if (linkAgenda.trim() && !/^https:\/\/\S+$/.test(linkAgenda.trim())) return setErro("O link da agenda precisa começar com https://");
    const obj = objecoes.map((o) => ({ objecao: o.objecao.trim(), resposta: o.resposta.trim() })).filter((o) => o.objecao || o.resposta);
    if (obj.some((o) => !o.objecao || !o.resposta)) return setErro("Cada objeção precisa da pergunta e da resposta.");
    setSalvando(true);
    const corpo = {
      nome,
      descricao: descricao.trim() || null,
      icpId,
      status,
      produto: produto || null,
      metaDiaria: meta,
      publico,
      argumento,
      ofertas,
      provaSocial,
      linkAgenda: linkAgenda.trim(),
      objecoes: obj,
      modeloLigacao: modelos.LIGACAO,
      modeloEmail: modelos.EMAIL,
      modeloEmailAssunto: assuntoEmail,
      modeloDirect: modelos.MENSAGEM,
      modeloWhatsapp: modelos.WHATSAPP,
    };
    const r = await chamar(campanha ? `/api/sdr/campanhas/${campanha.id}` : "/api/sdr/campanhas", campanha ? "PATCH" : "POST", corpo);
    setSalvando(false);
    if (!r.ok) return setErro(r.erro ?? "não deu pra salvar");
    onSalvo();
  }

  const canalAtual = CANAIS.find((c) => c.id === canal)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-lg bg-surface p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{campanha ? "Editar campanha" : "Nova campanha"}</h2>
          <button onClick={onFechar} className="text-lg leading-none text-neutral-400 hover:text-neutral-700" aria-label="Fechar">
            ×
          </button>
        </div>

        <form onSubmit={salvar} className="flex flex-col gap-5">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={rotulo}>Nome</span>
              <input id="campanha-nome" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={80} className={campo} />
            </label>
            <label className="sm:col-span-2">
              <span className={rotulo}>Descrição</span>
              <textarea id="campanha-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} rows={2} className={campo} />
            </label>
            <label>
              <span className={rotulo}>Perfil de cliente</span>
              <select id="campanha-perfil" value={icpId} onChange={(e) => setIcpId(e.target.value)} required className={campo}>
                {perfis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={rotulo}>Status</span>
              <select id="campanha-status" value={status} onChange={(e) => setStatus(e.target.value as Status)} className={campo}>
                {STATUS_CAMPANHA.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_CAMPANHA[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={rotulo}>Produto</span>
              <select value={produto} onChange={(e) => setProduto(e.target.value as typeof produto)} className={campo}>
                <option value="DILON_ZAP">Dilon Zap</option>
                <option value="DILON_FACILITIES">Dilon Facilities</option>
                <option value="">Escolher na fila</option>
              </select>
            </label>
            <label>
              <span className={rotulo}>Meta diária (empresas novas)</span>
              <input type="number" min={1} max={200} value={metaDiaria} onChange={(e) => setMetaDiaria(e.target.value)} className={campo} />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-3 border-t border-neutral-100 pt-4">
            <legend className="text-sm font-semibold">Roteiro de venda</legend>
            <p className="-mt-1 text-[11px] text-neutral-500">Fica à mão na revisão e na ficha. É também o que a IA vai usar para responder, quando for ligada.</p>
            <label>
              <span className={rotulo}>Para quem é</span>
              <textarea value={publico} onChange={(e) => setPublico(e.target.value)} maxLength={1000} rows={2} className={campo} placeholder="Ex.: revendas de seminovos de RJ e SP, de 20 a 150 carros, que usam AutoCerto." />
            </label>
            <label>
              <span className={rotulo}>Argumento principal</span>
              <textarea value={argumento} onChange={(e) => setArgumento(e.target.value)} maxLength={3000} rows={4} className={campo} placeholder="Por que trocar, em poucas linhas." />
            </label>
            <label>
              <span className={rotulo}>Ofertas e condições</span>
              <textarea value={ofertas} onChange={(e) => setOfertas(e.target.value)} maxLength={3000} rows={3} className={campo} placeholder="Planos, preços, condição de migração." />
            </label>
            <label>
              <span className={rotulo}>Prova social</span>
              <textarea value={provaSocial} onChange={(e) => setProvaSocial(e.target.value)} maxLength={2000} rows={2} className={campo} placeholder="Clientes, números, depoimentos que você pode citar." />
            </label>
            <label>
              <span className={rotulo}>Link para agendar a demonstração</span>
              <input value={linkAgenda} onChange={(e) => setLinkAgenda(e.target.value)} maxLength={500} placeholder="https://" className={campo} />
              <p className={ajuda}>Entra nas mensagens pela variável {"{link_agenda}"}.</p>
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-2 border-t border-neutral-100 pt-4">
            <legend className="text-sm font-semibold">Objeções e respostas</legend>
            {objecoes.length === 0 && <p className="text-[11px] text-neutral-500">Nenhuma ainda. Ex.: “Já uso AutoCerto”, “Está caro”, “Migrar dá trabalho”.</p>}
            {objecoes.map((o, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-neutral-200 p-2 sm:grid-cols-[1fr_2fr_auto]">
                <input value={o.objecao} onChange={(e) => setObjecoes(objecoes.map((x, j) => (j === i ? { ...x, objecao: e.target.value } : x)))} maxLength={300} placeholder="O cliente diz…" aria-label={`Objeção ${i + 1}`} className={campo} />
                <textarea value={o.resposta} onChange={(e) => setObjecoes(objecoes.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)))} maxLength={1500} rows={2} placeholder="Você responde…" aria-label={`Resposta ${i + 1}`} className={campo} />
                <button type="button" onClick={() => setObjecoes(objecoes.filter((_, j) => j !== i))} className="self-start px-2 py-2 text-xs text-neutral-500 hover:text-red-600">
                  Remover
                </button>
              </div>
            ))}
            {objecoes.length < 30 && (
              <button type="button" onClick={() => setObjecoes([...objecoes, { objecao: "", resposta: "" }])} className="self-start text-xs text-accent hover:underline">
                Adicionar objeção
              </button>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-3 border-t border-neutral-100 pt-4">
            <legend className="text-sm font-semibold">Modelos de mensagem</legend>
            <div role="tablist" className="flex flex-wrap gap-1 border-b border-neutral-200">
              {CANAIS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={canal === c.id}
                  onClick={() => setCanal(c.id)}
                  className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${canal === c.id ? "border-accent font-medium text-accent" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}
                >
                  {c.nome}
                  {modelos[c.id].trim() ? "" : <span className="ml-1 text-[10px] text-neutral-400">(neutro)</span>}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500">{canalAtual.dica} Em branco, o preparo usa o modelo neutro.</p>
            {canal === "EMAIL" && (
              <label>
                <span className={rotulo}>Assunto</span>
                <input value={assuntoEmail} onChange={(e) => setAssuntoEmail(e.target.value)} maxLength={200} className={campo} />
              </label>
            )}
            <textarea
              ref={caixa}
              value={modelos[canal]}
              onChange={(e) => setModelos({ ...modelos, [canal]: e.target.value })}
              maxLength={canal === "WHATSAPP" ? 2000 : canal === "MENSAGEM" ? 1000 : 6000}
              rows={canal === "LIGACAO" || canal === "EMAIL" ? 10 : 6}
              aria-label={`Modelo de ${canalAtual.nome}`}
              className={`${campo} font-mono text-[13px]`}
            />
            <div className="flex flex-wrap gap-1">
              {Object.entries(VARIAVEIS_DO_MODELO).map(([v, descr]) => (
                <button key={v} type="button" title={descr} onClick={() => inserir(v)} className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700 hover:border-accent">
                  {`{${v}}`}
                </button>
              ))}
            </div>
            {desconhecidas.length > 0 && <p className="text-xs text-red-600">Variável desconhecida: {desconhecidas.map((v) => `{${v}}`).join(", ")}.</p>}
            {modelos[canal].trim() && (
              <div className="rounded-md bg-neutral-50 p-3">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Prévia com uma empresa de exemplo</p>
                {canal === "EMAIL" && assuntoEmail.trim() && <p className="mb-1 text-sm font-medium">{preencherModelo(assuntoEmail, exemplo)}</p>}
                <p className="whitespace-pre-wrap text-sm text-neutral-800">{preencherModelo(modelos[canal], exemplo)}</p>
              </div>
            )}
          </fieldset>

          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
