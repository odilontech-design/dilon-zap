"use client";

import { useState } from "react";
import useSWR from "swr";
import { AreaTexto, Botao, Campo, Entrada, Selecao } from "@/components/campos";
import { Card, Tabela, TituloPagina, Vazio } from "@/components/ui";
import { buscar, enviar } from "@/lib/fetcher";

type Cliente = {
  id: string;
  nome: string;
  tipo: "FISICA" | "JURIDICA";
  documento: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
};

const VAZIO = {
  nome: "",
  tipo: "FISICA" as const,
  documento: "",
  telefone: "",
  email: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  uf: "",
  cep: "",
  observacoes: "",
};

export function PainelClientes() {
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<typeof VAZIO | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const { data, mutate, isLoading } = useSWR<Cliente[]>(`/api/clientes?busca=${encodeURIComponent(busca)}`, buscar);

  async function salvar() {
    if (!form) return;
    setErro(null);
    try {
      // Campos vazios viram null na API; mandar "" faria o documento vazio
      // colidir no unique com todos os outros clientes sem CPF.
      const dados = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" ? null : v]));
      if (editandoId) await enviar(`/api/clientes/${editandoId}`, "PATCH", dados);
      else await enviar("/api/clientes", "POST", { ...dados, nome: form.nome, tipo: form.tipo });
      setForm(null);
      setEditandoId(null);
      mutate();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível salvar");
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Clientes"
        descricao="Cada orçamento, obra e conta a receber fica preso ao cliente — é o que monta o histórico de compra."
        acao={
          <Botao
            onClick={() => {
              setForm(VAZIO);
              setEditandoId(null);
            }}
          >
            Novo cliente
          </Botao>
        }
      />

      {erro && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      {form && (
        <Card className="mb-4 p-4">
          <h2 className="mb-3 font-medium text-neutral-900">{editandoId ? "Editar cliente" : "Novo cliente"}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Nome" className="sm:col-span-2">
              <Entrada value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Tipo">
              <Selecao value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as "FISICA" })}>
                <option value="FISICA">Pessoa física</option>
                <option value="JURIDICA">Pessoa jurídica</option>
              </Selecao>
            </Campo>
            <Campo rotulo={form.tipo === "FISICA" ? "CPF" : "CNPJ"}>
              <Entrada value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
            </Campo>
            <Campo rotulo="Telefone">
              <Entrada value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </Campo>
            <Campo rotulo="Email">
              <Entrada type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Campo>
            <Campo rotulo="Endereço" className="sm:col-span-2">
              <Entrada value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
            </Campo>
            <Campo rotulo="Número">
              <Entrada value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </Campo>
            <Campo rotulo="Bairro">
              <Entrada value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </Campo>
            <Campo rotulo="Cidade">
              <Entrada value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </Campo>
            <Campo rotulo="UF">
              <Entrada maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} />
            </Campo>
            <Campo rotulo="Observações" className="sm:col-span-3">
              <AreaTexto rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </Campo>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => setForm(null)}>
              Cancelar
            </Botao>
            <Botao onClick={salvar} disabled={form.nome.trim().length < 2}>
              Salvar
            </Botao>
          </div>
        </Card>
      )}

      <div className="mb-4">
        <Entrada placeholder="Buscar por nome, documento ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
      </div>

      <Card>
        {isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Carregando…</p>
        ) : !data || data.length === 0 ? (
          <Vazio titulo={busca ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"} />
        ) : (
          <Tabela cabecalho={["Nome", "Documento", "Contato", "Cidade", ""]}>
            {data.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <span className="font-medium text-neutral-900">{c.nome}</span>
                  <span className="ml-2 text-xs text-neutral-500">{c.tipo === "FISICA" ? "PF" : "PJ"}</span>
                </td>
                <td className="px-4 py-3 text-neutral-700">{c.documento ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-700">
                  {c.telefone ?? "—"}
                  {c.email && <span className="block text-xs text-neutral-500">{c.email}</span>}
                </td>
                <td className="px-4 py-3 text-neutral-700">{[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      setEditandoId(c.id);
                      setForm({ ...VAZIO, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ""])) } as typeof VAZIO);
                    }}
                    className="text-sm text-accent hover:underline"
                  >
                    editar
                  </button>
                </td>
              </tr>
            ))}
          </Tabela>
        )}
      </Card>
    </>
  );
}
