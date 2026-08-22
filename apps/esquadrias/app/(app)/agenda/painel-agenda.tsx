"use client";

import { useState } from "react";
import useSWR from "swr";
import { Botao, Campo, Entrada, Selecao } from "@/components/campos";
import { Card, Etiqueta, TituloPagina, Vazio, type Tom } from "@/components/ui";
import { buscar, enviar } from "@/lib/fetcher";

type Compromisso = {
  id: string;
  tipo: "MEDICAO" | "VISITA" | "INSTALACAO" | "ENTREGA" | "MANUTENCAO" | "OUTRO";
  titulo: string;
  inicio: string;
  concluido: boolean;
  cliente: { nome: string; telefone: string | null } | null;
  obra: { titulo: string } | null;
  responsavel: { nome: string } | null;
};

const TOM_TIPO: Record<Compromisso["tipo"], Tom> = {
  MEDICAO: "azul",
  VISITA: "neutro",
  INSTALACAO: "verde",
  ENTREGA: "amarelo",
  MANUTENCAO: "vermelho",
  OUTRO: "neutro",
};

type Opcao = { id: string; nome?: string; titulo?: string };

export function PainelAgenda({ clientes, obras, equipe }: { clientes: Opcao[]; obras: Opcao[]; equipe: Opcao[] }) {
  const hoje = new Date();
  const [de, setDe] = useState(hoje.toISOString().slice(0, 10));
  const [dias, setDias] = useState(30);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const inicio = new Date(`${de}T00:00:00`);
  const fim = new Date(inicio.getTime() + dias * 86400000);
  const { data, mutate, isLoading } = useSWR<Compromisso[]>(
    `/api/compromissos?de=${inicio.toISOString()}&ate=${fim.toISOString()}`,
    buscar,
  );

  // Agrupa por dia: a agenda de campo é lida por dia ("o que tem amanhã?"),
  // não por lista corrida de compromissos.
  const porDia = new Map<string, Compromisso[]>();
  for (const c of data ?? []) {
    const chave = new Date(c.inicio).toLocaleDateString("pt-BR");
    porDia.set(chave, [...(porDia.get(chave) ?? []), c]);
  }

  return (
    <>
      <TituloPagina
        titulo="Agenda"
        descricao="Medições, instalações e entregas. Cada compromisso pode ficar ligado ao cliente e à obra."
        acao={<Botao onClick={() => setNovo((v) => !v)}>{novo ? "Fechar" : "Novo compromisso"}</Botao>}
      />

      {erro && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      {novo && (
        <FormularioCompromisso
          clientes={clientes}
          obras={obras}
          equipe={equipe}
          aoSalvar={async (dados) => {
            setErro(null);
            try {
              await enviar("/api/compromissos", "POST", dados);
              setNovo(false);
              mutate();
            } catch (e) {
              setErro(e instanceof Error ? e.message : "não foi possível salvar");
            }
          }}
        />
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <Campo rotulo="A partir de">
          <Entrada type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </Campo>
        <Campo rotulo="Período">
          <Selecao value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </Selecao>
        </Campo>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : porDia.size === 0 ? (
        <Card>
          <Vazio titulo="Nenhum compromisso no período" />
        </Card>
      ) : (
        <div className="space-y-4">
          {[...porDia.entries()].map(([dia, compromissos]) => (
            <Card key={dia}>
              <h2 className="border-b border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-900">{dia}</h2>
              <ul className="divide-y divide-neutral-200">
                {compromissos.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className={`font-medium ${c.concluido ? "text-neutral-400 line-through" : "text-neutral-900"}`}>{c.titulo}</p>
                      <p className="text-xs text-neutral-500">
                        {new Date(c.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {c.cliente ? ` · ${c.cliente.nome}` : ""}
                        {c.obra ? ` · ${c.obra.titulo}` : ""}
                        {c.responsavel ? ` · ${c.responsavel.nome}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Etiqueta tom={TOM_TIPO[c.tipo]}>{c.tipo.toLowerCase()}</Etiqueta>
                      <button
                        onClick={async () => {
                          await enviar(`/api/compromissos/${c.id}`, "PATCH", { concluido: !c.concluido });
                          mutate();
                        }}
                        className="text-sm text-accent hover:underline"
                      >
                        {c.concluido ? "reabrir" : "concluir"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function FormularioCompromisso({
  clientes,
  obras,
  equipe,
  aoSalvar,
}: {
  clientes: Opcao[];
  obras: Opcao[];
  equipe: Opcao[];
  aoSalvar: (dados: Record<string, unknown>) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("MEDICAO");
  const [quando, setQuando] = useState(new Date().toISOString().slice(0, 16));
  const [clienteId, setClienteId] = useState("");
  const [obraId, setObraId] = useState("");
  const [responsavelId, setResponsavelId] = useState("");

  return (
    <Card className="mb-4 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Título" className="sm:col-span-2">
          <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Medição — Rua das Flores, 120" />
        </Campo>
        <Campo rotulo="Tipo">
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {["MEDICAO", "VISITA", "INSTALACAO", "ENTREGA", "MANUTENCAO", "OUTRO"].map((t) => (
              <option key={t} value={t}>
                {t.toLowerCase()}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Quando">
          <Entrada type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
        </Campo>
        <Campo rotulo="Cliente">
          <Selecao value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">—</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Obra">
          <Selecao value={obraId} onChange={(e) => setObraId(e.target.value)}>
            <option value="">—</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.titulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Responsável">
          <Selecao value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
            <option value="">Eu</option>
            {equipe.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>

      <div className="mt-3 flex justify-end">
        <Botao
          disabled={titulo.trim().length < 2}
          onClick={() =>
            aoSalvar({
              titulo,
              tipo,
              inicio: new Date(quando).toISOString(),
              clienteId: clienteId || null,
              obraId: obraId || null,
              responsavelId: responsavelId || null,
            })
          }
        >
          Agendar
        </Botao>
      </div>
    </Card>
  );
}
