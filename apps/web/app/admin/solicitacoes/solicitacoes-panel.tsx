"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatarDocumentoBR } from "@/lib/documento";
import { planoSugerido, rotuloFaixa } from "@/lib/qualificacao";
import { PLANOS, type Plano } from "@/lib/plano-regras";

/**
 * Fila de autocadastros vindos da página de login.
 *
 * Aprovar CRIA a empresa na hora, com acesso do responsável e assinatura em
 * teste. A senha provisória aparece UMA vez, aqui — ela não fica guardada em
 * texto em lugar nenhum, então quem aprovar precisa copiar antes de fechar.
 */

type Solicitacao = {
  id: string;
  nome: string;
  empresa: string;
  email: string;
  telefone: string;
  documento: string | null;
  ramo: string | null;
  atendentes: string | null;
  status: "PENDENTE" | "APROVADA" | "RECUSADA";
  motivo: string | null;
  criadoEm: string;
  decididoEm: string | null;
  decididoPor: { name: string } | null;
  tenant: { id: string; name: string } | null;
};

type Credenciais = { email: string; senha: string; empresa: string; nome: string; telefone: string };

/**
 * wa.me exige o número com código do país. Cadastro do formulário costuma vir
 * só com DDD — "(21) 99999-9999" — então o 55 entra quando falta.
 */
function numeroWhatsApp(telefone: string): string {
  const d = telefone.replace(/\D/g, "");
  return d.length <= 11 ? `55${d}` : d;
}

/**
 * Mensagem com o acesso, pronta pra Dilon Tech só tocar em enviar. Antes era
 * copiar e-mail e senha da tela e digitar a mensagem à mão — com o lead do
 * anúncio esfriando do outro lado.
 */
function mensagemDeAcesso(c: Credenciais): string {
  const primeiroNome = c.nome.trim().split(/\s+/)[0] ?? "";
  return [
    `Oi, ${primeiroNome}! Seu teste grátis de 14 dias do Dilon Zap está liberado 🎉`,
    ``,
    `Acesse: ${window.location.origin}/login`,
    `E-mail: ${c.email}`,
    `Senha provisória: ${c.senha}`,
    ``,
    `No primeiro acesso o sistema pede pra você criar sua própria senha. Qual o melhor horário pra eu te ajudar a conectar seu WhatsApp? Leva uns 15 minutos.`,
  ].join("\n");
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

async function erroDe(res: Response, padrao: string): Promise<string> {
  const b = await res.json().catch(() => ({}));
  return typeof b.error === "string" ? b.error : padrao;
}

/**
 * Manda o acesso pelo número da própria Dilon Tech, dentro do Dilon Zap — o
 * mesmo caminho do "Nova conversa" do Inbox: cria (ou acha) o contato, abre a
 * conversa assumida por quem aprovou e põe a mensagem na fila do worker.
 * Assim o lead fica no Inbox e no CRM da Dilon Tech, com o histórico, em vez
 * de ir parar no WhatsApp do celular de alguém.
 */
async function enviarPeloDilonZap(c: Credenciais): Promise<{ conversaId: string }> {
  const resContato = await fetch("/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: numeroWhatsApp(c.telefone), name: c.nome.trim() || c.empresa }),
  });
  if (!resContato.ok) throw new Error(await erroDe(resContato, "não deu pra criar o contato"));
  const contato = await resContato.json();

  const resConversa = await fetch(`/api/contacts/${contato.id}/start-conversation`, { method: "POST" });
  if (!resConversa.ok) throw new Error(await erroDe(resConversa, "não deu pra abrir a conversa"));
  const conversa = await resConversa.json();

  const resEnvio = await fetch("/api/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId: conversa.id, text: mensagemDeAcesso(c) }),
  });
  if (!resEnvio.ok) throw new Error(await erroDe(resEnvio, "não deu pra enviar a mensagem"));
  return { conversaId: conversa.id };
}

const ROTULO_STATUS: Record<Solicitacao["status"], { texto: string; classe: string }> = {
  PENDENTE: { texto: "Aguardando", classe: "border-amber-900 bg-amber-950/50 text-amber-300" },
  APROVADA: { texto: "Aprovada", classe: "border-emerald-900 bg-emerald-950/50 text-emerald-300" },
  RECUSADA: { texto: "Recusada", classe: "border-neutral-700 text-neutral-500" },
};

export function SolicitacoesPanel() {
  const { data, mutate } = useSWR<Solicitacao[]>("/api/admin/solicitacoes", fetcher, {
    refreshInterval: 60_000,
  });
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const [envio, setEnvio] = useState<{ estado: "enviando" | "enviado" | "erro"; conversaId?: string; erro?: string } | null>(null);

  async function enviarAcesso(c: Credenciais) {
    setEnvio({ estado: "enviando" });
    try {
      const { conversaId } = await enviarPeloDilonZap(c);
      setEnvio({ estado: "enviado", conversaId });
    } catch (e) {
      setEnvio({ estado: "erro", erro: (e as Error).message });
    }
  }
  // Plano escolhido por cadastro; sem escolha, vale o sugerido pela equipe informada.
  const [planoEscolhido, setPlanoEscolhido] = useState<Record<string, Plano>>({});
  const planoDe = (s: Solicitacao) => planoEscolhido[s.id] ?? planoSugerido(s.atendentes);

  async function decidir(s: Solicitacao, acao: "aprovar" | "recusar") {
    if (acao === "aprovar") {
      if (!confirm(`Criar a empresa "${s.empresa}" no plano ${PLANOS[planoDe(s)].nome} e liberar o acesso de ${s.email}?`)) return;
    }
    const motivo = acao === "recusar" ? prompt("Motivo da recusa (opcional):") ?? "" : undefined;

    setOcupadoId(s.id);
    setErro(null);
    const res = await fetch(`/api/admin/solicitacoes/${s.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, motivo, plano: planoDe(s) }),
    });
    setOcupadoId(null);

    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(typeof b.error === "string" ? b.error : "não deu pra concluir");
      return;
    }
    if (acao === "aprovar" && b.senha) {
      setCredenciais({ email: b.email, senha: b.senha, empresa: s.empresa, nome: s.nome, telefone: s.telefone });
      setEnvio(null);
    }
    mutate();
  }

  if (!data) return <p className="text-sm text-neutral-500">Carregando...</p>;
  if (!Array.isArray(data)) return <p className="text-sm text-red-400">não deu pra carregar</p>;

  const pendentes = data.filter((s) => s.status === "PENDENTE");

  return (
    <div>
      {erro && (
        <p className="mb-4 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">{erro}</p>
      )}

      {credenciais && (
        <div className="mb-5 rounded-lg border border-emerald-800 bg-emerald-950/40 p-4">
          <p className="text-sm font-medium text-emerald-200">
            {credenciais.empresa} criada. Passe estes dados ao cliente:
          </p>
          <p className="mt-2 font-mono text-sm text-emerald-100">{credenciais.email}</p>
          <p className="font-mono text-sm text-emerald-100">{credenciais.senha}</p>
          <p className="mt-2 text-xs text-emerald-300/80">
            A senha não fica guardada e não aparece de novo — copie antes de fechar. O responsável
            troca no primeiro acesso.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {envio?.estado === "enviado" ? (
              <>
                <span className="text-xs font-medium text-emerald-300">Mensagem com o acesso enviada pelo Dilon Zap ✓</span>
                <a
                  href={`/inbox?open=${envio.conversaId}`}
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:opacity-90"
                >
                  Abrir a conversa
                </a>
              </>
            ) : (
              <button
                onClick={() => enviarAcesso(credenciais)}
                disabled={envio?.estado === "enviando"}
                className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:opacity-90 disabled:opacity-50"
              >
                {envio?.estado === "enviando" ? "Enviando..." : "Enviar acesso pelo Dilon Zap"}
              </button>
            )}
            <button
              onClick={() => {
                setCredenciais(null);
                setEnvio(null);
              }}
              className="rounded-md border border-emerald-700 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900/40"
            >
              {envio?.estado === "enviado" ? "Fechar" : "Já enviei"}
            </button>
          </div>
          {envio?.estado === "erro" && (
            <p className="mt-2 text-xs text-red-300">
              {envio.erro}.{" "}
              <a
                href={`https://wa.me/${numeroWhatsApp(credenciais.telefone)}?text=${encodeURIComponent(mensagemDeAcesso(credenciais))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Enviar pelo WhatsApp do celular
              </a>
            </p>
          )}
        </div>
      )}

      <p className="mb-3 text-xs text-neutral-500">
        {pendentes.length === 0
          ? "Nenhum cadastro aguardando."
          : `${pendentes.length} cadastro(s) aguardando decisão.`}
      </p>

      <ul className="flex flex-col gap-2">
        {data.map((s) => {
          const rotulo = ROTULO_STATUS[s.status];
          return (
            <li key={s.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-100">{s.empresa}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${rotulo.classe}`}>
                      {rotulo.texto}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-300">{s.nome}</p>
                  <p className="text-xs text-neutral-400">
                    {[s.email, s.telefone, s.documento ? formatarDocumentoBR(s.documento) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {(s.ramo || s.atendentes) && (
                    <p className="mt-1 text-xs text-emerald-300/90">
                      {[s.ramo, s.atendentes ? `${rotuloFaixa(s.atendentes)} no WhatsApp` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Enviado em {new Date(s.criadoEm).toLocaleString("pt-BR")}
                    {s.decididoEm &&
                      ` · decidido por ${s.decididoPor?.name ?? "—"} em ${new Date(s.decididoEm).toLocaleString("pt-BR")}`}
                    {s.tenant && ` · empresa: ${s.tenant.name}`}
                  </p>
                  {s.motivo && <p className="mt-1 text-[11px] text-neutral-400">Motivo: {s.motivo}</p>}
                </div>

                {s.status === "PENDENTE" && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {/* Pré-selecionado pelo tamanho da equipe; a Dilon Tech decide. */}
                    <select
                      value={planoDe(s)}
                      onChange={(e) => setPlanoEscolhido((m) => ({ ...m, [s.id]: e.target.value as Plano }))}
                      disabled={ocupadoId === s.id}
                      aria-label="Plano do teste"
                      className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs"
                    >
                      {(Object.keys(PLANOS) as Plano[]).map((p) => (
                        <option key={p} value={p}>
                          {PLANOS[p].nome}
                          {p === planoSugerido(s.atendentes) && s.atendentes ? " (sugerido)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => decidir(s, "recusar")}
                      disabled={ocupadoId === s.id}
                      className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      Recusar
                    </button>
                    <button
                      onClick={() => decidir(s, "aprovar")}
                      disabled={ocupadoId === s.id}
                      className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:opacity-90 disabled:opacity-50"
                    >
                      {ocupadoId === s.id ? "..." : "Aprovar e criar"}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
