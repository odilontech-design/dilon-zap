"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Avatar } from "@/components/avatar";
import { contactLabel, formatDate, formatPhone, formatPhoneDisplay, type ContactRef } from "@/lib/contact";
import { readableTextColor, tagColor, type TagDef } from "@/lib/tags";
import { LISTING_INTERVAL } from "@/lib/polling";
import { SeloPendencia, type PendenciaResumo } from "@/components/selo-pendencia";
import { ContactCard } from "@/components/contact-card";
import { salvarContato } from "@/lib/salvar-contato";

type StageDef = { id: string; name: string; color: string };

type Contact = ContactRef & {
  documento?: string | null;
  email?: string | null;
  stageId: string | null;
  stage: StageDef | null;
  dealValueCents: number;
  tags: string[];
  createdAt: string;
  // null = ainda não checado, que é diferente de "não tem".
  hasWhatsapp: boolean | null;
  // Quanto deve em parcelas em aberto (null = nada).
  pendencia: PendenciaResumo | null;
  // Pedidos fechados e quando foi o último; e a última mensagem da conversa mais recente.
  compras?: number;
  ultimaCompraEm?: string | null;
  ultimaMensagemEm?: string | null;
};

type ResultadoLote = { excluidos: number; ignorados: { id: string; nome: string | null; motivo: string }[] };

const DIA_MS = 24 * 60 * 60 * 1000;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ContactsPanel() {
  const router = useRouter();
  const { data: contacts, mutate } = useSWR<Contact[]>("/api/contacts", fetcher, {
    refreshInterval: LISTING_INTERVAL,
  });
  const { data: tagDefs } = useSWR<TagDef[]>("/api/tags", fetcher);
  const { data: stages } = useSWR<StageDef[]>("/api/stages", fetcher);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  // Pagamento: todos | quem tem parcela em aberto | quem tem parcela vencida.
  const [pagamentoFiltro, setPagamentoFiltro] = useState<"" | "pendente" | "atraso">("");
  const [dupeOnly, setDupeOnly] = useState(false);
  // Limpeza da base: quem nunca comprou / quem não conversa há tempo, e seleção para excluir em lote.
  const [compraFiltro, setCompraFiltro] = useState<"" | "nunca" | "comprou">("");
  const [paradoFiltro, setParadoFiltro] = useState<"" | "30" | "90" | "180" | "nunca">("");
  const [selecionando, setSelecionando] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [excluindoLote, setExcluindoLote] = useState(false);
  const [resultadoLote, setResultadoLote] = useState<ResultadoLote | null>(null);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  // "Editar" abre a ficha completa (cadastro, etapas, pedidos), a mesma do
  // Inbox — o formulário curto ficou só para "Novo contato".
  const [fichaDe, setFichaDe] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [checando, setChecando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Duas pistas fracas, mas úteis juntas: mesmo número digitado (pega
  // reimportação por engano) e mesmo nome (pega o caso de um contato com
  // privacidade de número — @lid — cadastrado com o nome que já existia).
  // Nenhuma das duas pega TODO caso real, mas cobrem a maioria.
  const duplicateReasons = useMemo(() => {
    const reasons = new Map<string, string>();
    if (!contacts) return reasons;

    const byDigits = new Map<string, Contact[]>();
    const byName = new Map<string, Contact[]>();

    for (const c of contacts) {
      const digits = c.waJid.split("@")[0];
      byDigits.set(digits, [...(byDigits.get(digits) ?? []), c]);

      if (c.name) {
        const normalized = c.name.trim().toLowerCase();
        byName.set(normalized, [...(byName.get(normalized) ?? []), c]);
      }
    }

    for (const group of byDigits.values()) {
      if (group.length < 2) continue;
      for (const c of group) reasons.set(c.id, "mesmo número");
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      for (const c of group) {
        const existing = reasons.get(c.id);
        reasons.set(c.id, existing ? "mesmo número e nome" : "nome igual a outro contato");
      }
    }

    return reasons;
  }, [contacts]);

  const filtered = useMemo(() => {
    if (!contacts) return undefined;
    const term = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (dupeOnly && !duplicateReasons.has(c.id)) return false;
      if (stageFilter && c.stageId !== stageFilter) return false;
      if (pagamentoFiltro === "pendente" && !c.pendencia) return false;
      if (pagamentoFiltro === "atraso" && !(c.pendencia && c.pendencia.vencidas > 0)) return false;
      if (compraFiltro === "nunca" && (c.compras ?? 0) > 0) return false;
      if (compraFiltro === "comprou" && !(c.compras && c.compras > 0)) return false;
      if (paradoFiltro) {
        const ultima = c.ultimaMensagemEm ? new Date(c.ultimaMensagemEm).getTime() : null;
        if (paradoFiltro === "nunca") {
          if (ultima !== null) return false;
        } else if (ultima !== null && Date.now() - ultima < Number(paradoFiltro) * DIA_MS) {
          return false;
        }
      }
      if (!term) return true;
      const digitos = term.replace(/\D/g, "");
      const doc = (c.documento ?? "").toLowerCase();
      return (
        contactLabel(c).toLowerCase().includes(term) ||
        formatPhone(c.waJid).includes(term) ||
        (c.email ?? "").toLowerCase().includes(term) ||
        doc.includes(term) ||
        (digitos.length >= 3 && doc.replace(/\D/g, "").includes(digitos))
      );
    });
  }, [contacts, search, stageFilter, pagamentoFiltro, compraFiltro, paradoFiltro, dupeOnly, duplicateReasons]);

  const idsFiltrados = filtered?.map((c) => c.id) ?? [];
  const todosMarcados = idsFiltrados.length > 0 && idsFiltrados.every((id) => marcados.has(id));

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function marcarTodosFiltrados() {
    setMarcados(todosMarcados ? new Set() : new Set(idsFiltrados));
  }

  function sairDaSelecao() {
    setSelecionando(false);
    setMarcados(new Set());
  }

  async function excluirMarcados() {
    const ids = [...marcados];
    if (ids.length === 0) return;
    const aviso =
      `Excluir ${ids.length} contato(s)? Isso apaga as conversas e mensagens deles e não dá para desfazer.\n\n` +
      "Quem tem pedido, conta a receber, negociação ou conversa aberta NÃO será excluído.";
    if (!confirm(aviso)) return;
    setExcluindoLote(true);
    setResultadoLote(null);
    // A rota aceita até 500 por vez; seleções maiores vão em várias chamadas.
    const total: ResultadoLote = { excluidos: 0, ignorados: [] };
    let falhou: string | null = null;
    for (let i = 0; i < ids.length; i += 500) {
      const res = await fetch("/api/contacts/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "excluir", ids: ids.slice(i, i + 500) }),
      }).catch(() => null);
      const corpo = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) {
        falhou = typeof corpo.error === "string" ? corpo.error : "não deu pra excluir agora";
        break;
      }
      total.excluidos += corpo.excluidos ?? 0;
      total.ignorados.push(...(corpo.ignorados ?? []));
    }
    setExcluindoLote(false);
    setResultadoLote(total);
    if (falhou) setImportSummary(`${falhou}. ${total.excluidos} contato(s) já tinham sido excluídos antes do erro.`);
    setMarcados(new Set());
    mutate();
  }

  async function handleStartConversation(contact: Contact) {
    const res = await fetch(`/api/contacts/${contact.id}/start-conversation`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json();
      alert(typeof body.error === "string" ? body.error : "não deu pra iniciar a conversa");
      return;
    }
    const conversation = await res.json();
    router.push(`/inbox?open=${conversation.id}`);
  }

  async function handleBlock(contact: Contact) {
    if (!confirm(`Bloquear ${contactLabel(contact)}? Ele para de receber qualquer mensagem.`)) return;
    await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waJid: contact.waJid, reason: "Bloqueado pela lista de contatos" }),
    });
  }

  async function handleDelete(contact: Contact) {
    if (!confirm(`Excluir ${contactLabel(contact)}? Isso apaga o histórico de conversas dele também.`))
      return;
    await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
    mutate();
  }

  // Roda em lotes, um por clique. Consultar a base inteira de uma vez é o
  // tipo de tráfego que faz o WhatsApp desconfiar do número — e derrubar a
  // sessão da Believe custa muito mais que checar em várias rodadas.
  async function checarWhatsApp() {
    setChecando(true);
    const res = await fetch("/api/contacts/check-whatsapp", { method: "POST" });
    setChecando(false);

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setImportSummary(typeof body.error === "string" ? body.error : "não deu pra checar agora");
      return;
    }
    if (body.verificados === 0) {
      setImportSummary("Todos os números já foram checados.");
      return;
    }
    setImportSummary(
      `${body.verificados} número(s) checado(s), ${body.semWhatsapp} sem WhatsApp.` +
        (body.restantes > 0 ? ` Faltam ${body.restantes} — clique de novo pra continuar.` : "")
    );
    mutate();
  }

  function handleExport() {
    window.open("/api/contacts/export", "_blank");
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) return;

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const nameIdx = header.findIndex((h) => h === "nome" || h === "name");
    const phoneIdx = header.findIndex((h) => h === "telefone" || h === "phone" || h === "número" || h === "numero");
    if (phoneIdx === -1) {
      alert('O CSV precisa de uma coluna "telefone" (ou "phone").');
      return;
    }

    const parsedRows = rows.slice(1).map((r) => ({
      name: nameIdx >= 0 ? r[nameIdx] : undefined,
      phone: r[phoneIdx] ?? "",
    }));

    const res = await fetch("/api/contacts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsedRows }),
    });
    const summary = await res.json();
    setImportSummary(
      `${summary.created} criados, ${summary.updated} já existiam, ${summary.skipped} ignorados (sem telefone válido).`
    );
    mutate();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Contatos</h1>
          <span className="text-xs font-mono rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500">
            {contacts?.length ?? "…"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (selecionando ? sairDaSelecao() : setSelecionando(true))}
            className={`text-xs rounded-md border px-3 py-1.5 ${selecionando ? "border-accent text-accent bg-accent/5" : "border-neutral-300 hover:bg-neutral-50"}`}
            title="Marcar vários contatos para excluir de uma vez"
          >
            {selecionando ? "Cancelar seleção" : "Selecionar"}
          </button>
          <button
            onClick={handleExport}
            className="text-xs rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
          >
            Exportar
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
          >
            Importar
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={checarWhatsApp}
            disabled={checando}
            title="Consulta o WhatsApp e marca os números que não têm conta"
            className="text-xs rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-50"
          >
            {checando ? "Checando..." : "Checar WhatsApp"}
          </button>
          <button
            onClick={() => setEditing("new")}
            className="text-xs rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90"
          >
            + Novo contato
          </button>
        </div>
      </div>

      {importSummary && (
        <div className="mb-4 text-xs rounded-md bg-accent/10 text-accent px-3 py-2 flex items-center justify-between">
          <span>{importSummary}</span>
          <button onClick={() => setImportSummary(null)} className="hover:opacity-70">
            ×
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, número, CPF ou e-mail..."
          className="flex-1 min-w-[180px] max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="text-sm rounded-md border border-neutral-300 px-2 py-2"
        >
          <option value="">Etapa: todas</option>
          {stages?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={pagamentoFiltro}
          onChange={(e) => setPagamentoFiltro(e.target.value as typeof pagamentoFiltro)}
          className="text-sm rounded-md border border-neutral-300 px-2 py-2"
          title="Clientes com parcelas em aberto no A receber"
        >
          <option value="">Pagamento: todos</option>
          <option value="pendente">Com pagamento pendente</option>
          <option value="atraso">Com pagamento em atraso</option>
        </select>
        <select
          value={compraFiltro}
          onChange={(e) => setCompraFiltro(e.target.value as typeof compraFiltro)}
          className="text-sm rounded-md border border-neutral-300 px-2 py-2"
          title="Pedidos fechados"
        >
          <option value="">Compras: todos</option>
          <option value="nunca">Nunca comprou</option>
          <option value="comprou">Já comprou</option>
        </select>
        <select
          value={paradoFiltro}
          onChange={(e) => setParadoFiltro(e.target.value as typeof paradoFiltro)}
          className="text-sm rounded-md border border-neutral-300 px-2 py-2"
          title="Quanto tempo faz que a última mensagem foi trocada"
        >
          <option value="">Última conversa: qualquer</option>
          <option value="30">Há mais de 30 dias</option>
          <option value="90">Há mais de 90 dias</option>
          <option value="180">Há mais de 180 dias</option>
          <option value="nunca">Nunca conversou</option>
        </select>
        {duplicateReasons.size > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-amber-700">
            <input type="checkbox" checked={dupeOnly} onChange={(e) => setDupeOnly(e.target.checked)} />
            Só possíveis duplicatas ({duplicateReasons.size})
          </label>
        )}
      </div>

      {selecionando && (
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm">
          <span>
            <strong>{marcados.size}</strong> marcado(s) de {idsFiltrados.length} na lista
            {idsFiltrados.length > 0 && (
              <button type="button" onClick={marcarTodosFiltrados} className="ml-3 text-xs text-accent hover:underline">
                {todosMarcados ? "Desmarcar todos" : `Marcar os ${idsFiltrados.length} da lista`}
              </button>
            )}
          </span>
          <button
            type="button"
            onClick={excluirMarcados}
            disabled={marcados.size === 0 || excluindoLote}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {excluindoLote ? "Excluindo..." : `Excluir ${marcados.size} contato(s)`}
          </button>
        </div>
      )}

      {resultadoLote && (
        <div role="status" className="mb-3 rounded-md border border-neutral-200 bg-surface px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <p>
              <strong>{resultadoLote.excluidos}</strong> contato(s) excluído(s)
              {resultadoLote.ignorados.length > 0 && <>, <strong>{resultadoLote.ignorados.length}</strong> mantido(s):</>}
            </p>
            <button onClick={() => setResultadoLote(null)} className="hover:opacity-70" aria-label="Fechar">
              ×
            </button>
          </div>
          {resultadoLote.ignorados.length > 0 && (
            <ul className="mt-1 max-h-32 overflow-y-auto text-neutral-600">
              {resultadoLote.ignorados.slice(0, 50).map((i) => (
                <li key={i.id}>
                  {i.nome ?? "Sem nome"} — {i.motivo}
                </li>
              ))}
              {resultadoLote.ignorados.length > 50 && <li>… e mais {resultadoLote.ignorados.length - 50}</li>}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              {selecionando && (
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" checked={todosMarcados} onChange={marcarTodosFiltrados} aria-label="Marcar todos da lista" />
                </th>
              )}
              <th className="text-left px-4 py-2 font-medium">Contato</th>
              <th className="text-left px-4 py-2 font-medium">Número</th>
              <th className="text-left px-4 py-2 font-medium">Etapa</th>
              <th className="text-left px-4 py-2 font-medium">Tags</th>
              <th className="text-left px-4 py-2 font-medium">Compras</th>
              <th className="text-left px-4 py-2 font-medium">Última conversa</th>
              <th className="text-left px-4 py-2 font-medium">Criado em</th>
              <th className="text-left px-4 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-neutral-400">
                  Nenhum contato encontrado.
                </td>
              </tr>
            )}
            {filtered?.map((c) => (
              <tr key={c.id} className={`border-t border-neutral-100 ${marcados.has(c.id) ? "bg-accent/5" : ""}`}>
                {selecionando && (
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={marcados.has(c.id)} onChange={() => alternar(c.id)} aria-label={`Marcar ${contactLabel(c)}`} />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar contact={c} size={28} />
                    <div>
                      <span className="font-medium">{contactLabel(c)}</span>
                      {c.pendencia && (
                        <div className="mt-0.5">
                          <SeloPendencia pendencia={c.pendencia} />
                        </div>
                      )}
                      {duplicateReasons.has(c.id) && (
                        <p className="text-[10px] text-amber-700" title="Confira se não é o mesmo contato duas vezes">
                          ⚠ possível duplicata — {duplicateReasons.get(c.id)}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-neutral-600">
                  {formatPhoneDisplay(c)}
                  {/* Só quando checamos e deu negativo. "Ainda não checado"
                      não vira aviso: dizer "sem WhatsApp" sobre quem apenas
                      não passou pela verificação faria a atendente excluir
                      contato bom. */}
                  {c.hasWhatsapp === false && (
                    <span
                      className="ml-2 text-[10px] rounded-full bg-red-100 text-red-900 px-2 py-0.5"
                      title="Este número não tem conta no WhatsApp. Confira antes de excluir — pode ser erro de digitação."
                    >
                      sem WhatsApp
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {c.stage ? (
                    <span
                      className="text-xs rounded-full px-2 py-0.5"
                      style={{ backgroundColor: c.stage.color, color: readableTextColor(c.stage.color) }}
                    >
                      {c.stage.name}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">Sem etapa</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 flex-wrap">
                    {c.tags.map((tag) => {
                      const color = tagColor(tagDefs, tag);
                      return (
                        <span
                          key={tag}
                          className="text-[10px] rounded-full px-2 py-0.5"
                          style={{ backgroundColor: color, color: readableTextColor(color) }}
                        >
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">
                  {c.compras ? `${c.compras}${c.ultimaCompraEm ? ` · ${formatDate(c.ultimaCompraEm)}` : ""}` : <span className="text-neutral-400">nunca</span>}
                </td>
                <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">
                  {c.ultimaMensagemEm ? formatDate(c.ultimaMensagemEm) : <span className="text-neutral-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-neutral-500">{formatDate(c.createdAt)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => setFichaDe(c.id)} className="text-neutral-600 hover:text-accent">
                      Editar
                    </button>
                    <button onClick={() => handleStartConversation(c)} className="text-accent hover:underline">
                      Conversar
                    </button>
                    <button onClick={() => handleBlock(c)} className="text-neutral-600 hover:text-red-600">
                      Bloquear
                    </button>
                    <button onClick={() => handleDelete(c)} className="text-red-600 hover:underline">
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fichaDe && (
        <ContactCard
          contactId={fichaDe}
          onFechar={() => {
            setFichaDe(null);
            mutate();
          }}
        />
      )}

      {editing && (
        <ContactFormModal
          contact={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function ContactFormModal({
  contact,
  onClose,
  onSaved,
}: {
  contact: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: stages } = useSWR<StageDef[]>("/api/stages", fetcher);
  const [name, setName] = useState(contact?.name ?? "");
  const [phone, setPhone] = useState(contact ? formatPhone(contact.waJid) : "");
  const [stageId, setStageId] = useState(contact?.stageId ?? "");
  const [dealValue, setDealValue] = useState(contact ? (contact.dealValueCents / 100).toFixed(2) : "0.00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (contact) {
      const dealValueCents = Math.round(parseFloat(dealValue.replace(",", ".")) * 100);
      const r = await salvarContato(contact.id, {
        name: name.trim() || null,
        stageId: stageId || null,
        dealValueCents: Number.isFinite(dealValueCents) ? dealValueCents : 0,
      });
      if (!r.ok) {
        setError(r.erro);
        setSaving(false);
        return;
      }
    } else {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, phone }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(typeof body.error === "string" ? body.error : "não deu pra salvar");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-6 w-full max-w-sm">
        <h2 className="text-sm font-semibold mb-4">{contact ? "Editar contato" : "Novo contato"}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Telefone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!!contact}
              placeholder="5511999999999"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          {contact && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Etapa</label>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="w-full text-sm rounded-md border border-neutral-300 px-2 py-2"
                >
                  <option value="">Sem etapa</option>
                  {stages?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Valor do negócio (R$)</label>
                <input
                  inputMode="decimal"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-xs rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Parser de CSV simples com suporte a campos entre aspas (pra nome com vírgula).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}
