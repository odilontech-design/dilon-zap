"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatarReais, lerCentavos } from "@dilon-zap/esquadrias-core";
import { Botao, Campo, Entrada, Selecao } from "@/components/campos";
import { Card, Tabela, TituloPagina, Vazio } from "@/components/ui";
import { buscar, enviar } from "@/lib/fetcher";

type Perfil = {
  id: string;
  codigo: string;
  nome: string;
  pesoPorMetro: number;
  precoPorKgCentavos: number;
  comprimentoBarraMm: number;
  linha: { id: string; nome: string } | null;
};
type Vidro = { id: string; nome: string; tipo: string; espessuraMm: number; precoM2Centavos: number; m2Minimo: number; temperado: boolean };
type Ferragem = { id: string; nome: string; unidade: string; precoUnitarioCentavos: number; fracionavel: boolean };
type Cor = { id: string; nome: string; hex: string; fatorAluminio: number; fatorFerragem: number };
type Linha = { id: string; nome: string; _count: { perfis: number; tipologias: number } };

const ABAS = [
  // "Perfis", não "Perfis de alumínio": a mesma aba guarda a linha de ferro
  // da serralheria — o que o motor precisa é kg/m, R$/kg e o tamanho da barra.
  ["perfis", "Perfis e barras"],
  ["vidros", "Vidros"],
  ["ferragens", "Ferragens"],
  ["cores", "Cores"],
] as const;

type Aba = (typeof ABAS)[number][0];

export function PainelCatalogo({ editavel }: { editavel: boolean }) {
  const [aba, setAba] = useState<Aba>("perfis");
  const [erro, setErro] = useState<string | null>(null);

  const perfis = useSWR<Perfil[]>("/api/catalogo/perfis", buscar);
  const vidros = useSWR<Vidro[]>("/api/catalogo/vidros", buscar);
  const ferragens = useSWR<Ferragem[]>("/api/catalogo/ferragens", buscar);
  const cores = useSWR<Cor[]>("/api/catalogo/cores", buscar);
  const linhas = useSWR<Linha[]>("/api/catalogo/linhas", buscar);

  async function acao(fn: () => Promise<unknown>, recarregar: () => void) {
    setErro(null);
    try {
      await fn();
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível salvar");
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Catálogo de insumos"
        descricao="O preço do orçamento nasce daqui. Perfil é cobrado por peso (kg/m × R$/kg) — vale igual pra alumínio e pra ferro —, vidro por m², e ferragem por peça ou a granel (kg de eletrodo, metro de trilho, m² de tinta)."
      />

      {erro && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-neutral-200">
        {ABAS.map(([chave, rotulo]) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`rounded-t-lg px-3 py-2 text-sm ${aba === chave ? "border-b-2 border-accent font-medium text-accent" : "text-neutral-500 hover:text-neutral-700"}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "perfis" && (
        <>
          {editavel && (
            <FormularioNovo
              titulo="Novo perfil"
              campos={[
                { chave: "codigo", rotulo: "Código", tipo: "texto" },
                { chave: "nome", rotulo: "Nome", tipo: "texto" },
                { chave: "pesoPorMetro", rotulo: "Peso (kg/m)", tipo: "decimal" },
                { chave: "precoPorKgCentavos", rotulo: "Preço por kg", tipo: "moeda" },
                { chave: "comprimentoBarraMm", rotulo: "Barra (mm)", tipo: "inteiro", padrao: "6000" },
                {
                  chave: "linhaId",
                  rotulo: "Linha",
                  tipo: "selecao",
                  opcoes: [{ valor: "", texto: "Sem linha" }, ...(linhas.data ?? []).map((l) => ({ valor: l.id, texto: l.nome }))],
                },
              ]}
              aoSalvar={(dados) => acao(() => enviar("/api/catalogo/perfis", "POST", { ...dados, linhaId: dados.linhaId || null }), perfis.mutate)}
            />
          )}

          <Card>
            {!perfis.data || perfis.data.length === 0 ? (
              <Vazio titulo="Nenhum perfil cadastrado" descricao="Cadastre os perfis da linha que você compra." />
            ) : (
              <Tabela cabecalho={["Código", "Nome", "Linha", "kg/m", "R$/kg", "Barra", ...(editavel ? [""] : [])]}>
                {perfis.data.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium text-neutral-900">{p.codigo}</td>
                    <td className="px-4 py-3 text-neutral-700">{p.nome}</td>
                    <td className="px-4 py-3 text-neutral-500">{p.linha?.nome ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-700">{p.pesoPorMetro.toFixed(3)}</td>
                    <td className="px-4 py-3">
                      {editavel ? (
                        <CampoPrecoInline
                          valorCentavos={p.precoPorKgCentavos}
                          aoSalvar={(centavos) => acao(() => enviar(`/api/catalogo/perfis/${p.id}`, "PATCH", { precoPorKgCentavos: centavos }), perfis.mutate)}
                        />
                      ) : (
                        formatarReais(p.precoPorKgCentavos)
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{p.comprimentoBarraMm} mm</td>
                    {editavel && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => acao(() => enviar(`/api/catalogo/perfis/${p.id}`, "DELETE"), perfis.mutate)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          remover
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </Tabela>
            )}
          </Card>
        </>
      )}

      {aba === "vidros" && (
        <>
          {editavel && (
            <FormularioNovo
              titulo="Novo vidro"
              campos={[
                { chave: "nome", rotulo: "Nome", tipo: "texto" },
                { chave: "tipo", rotulo: "Tipo", tipo: "texto", padrao: "INCOLOR" },
                { chave: "espessuraMm", rotulo: "Espessura (mm)", tipo: "decimal", padrao: "4" },
                { chave: "precoM2Centavos", rotulo: "Preço por m²", tipo: "moeda" },
                { chave: "m2Minimo", rotulo: "m² mínimo cobrado", tipo: "decimal", padrao: "0.5" },
              ]}
              aoSalvar={(dados) => acao(() => enviar("/api/catalogo/vidros", "POST", dados), vidros.mutate)}
            />
          )}

          <Card>
            {!vidros.data || vidros.data.length === 0 ? (
              <Vazio titulo="Nenhum vidro cadastrado" />
            ) : (
              <Tabela cabecalho={["Nome", "Espessura", "R$/m²", "m² mínimo", ...(editavel ? [""] : [])]}>
                {vidros.data.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3 font-medium text-neutral-900">{v.nome}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {v.espessuraMm} mm{v.temperado ? " · temperado" : ""}
                    </td>
                    <td className="px-4 py-3">
                      {editavel ? (
                        <CampoPrecoInline
                          valorCentavos={v.precoM2Centavos}
                          aoSalvar={(centavos) => acao(() => enviar(`/api/catalogo/vidros/${v.id}`, "PATCH", { precoM2Centavos: centavos }), vidros.mutate)}
                        />
                      ) : (
                        formatarReais(v.precoM2Centavos)
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{v.m2Minimo.toFixed(2)}</td>
                    {editavel && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => acao(() => enviar(`/api/catalogo/vidros/${v.id}`, "DELETE"), vidros.mutate)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          remover
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </Tabela>
            )}
          </Card>
        </>
      )}

      {aba === "ferragens" && (
        <>
          {editavel && (
            <FormularioNovo
              titulo="Nova ferragem"
              campos={[
                { chave: "nome", rotulo: "Nome", tipo: "texto" },
                { chave: "unidade", rotulo: "Unidade", tipo: "texto", padrao: "pç" },
                { chave: "precoUnitarioCentavos", rotulo: "Preço unitário", tipo: "moeda" },
                { chave: "fracionavel", rotulo: "Vendido a granel (kg, m, m²)", tipo: "booleano", padrao: "nao" },
              ]}
              aoSalvar={(dados) => acao(() => enviar("/api/catalogo/ferragens", "POST", dados), ferragens.mutate)}
            />
          )}

          <Card>
            {!ferragens.data || ferragens.data.length === 0 ? (
              <Vazio titulo="Nenhuma ferragem cadastrada" />
            ) : (
              <Tabela cabecalho={["Nome", "Unidade", "Cobrança", "Preço", ...(editavel ? [""] : [])]}>
                {ferragens.data.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-3 font-medium text-neutral-900">{f.nome}</td>
                    <td className="px-4 py-3 text-neutral-700">{f.unidade}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {editavel ? (
                        <button
                          onClick={() =>
                            acao(
                              () => enviar(`/api/catalogo/ferragens/${f.id}`, "PATCH", { fracionavel: !f.fracionavel }),
                              ferragens.mutate,
                            )
                          }
                          className="text-sm text-accent hover:underline"
                          title="Granel cobra a fração (0,48 kg de eletrodo). Por peça arredonda pra cima."
                        >
                          {f.fracionavel ? "granel" : "por peça"}
                        </button>
                      ) : (
                        <>{f.fracionavel ? "granel" : "por peça"}</>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editavel ? (
                        <CampoPrecoInline
                          valorCentavos={f.precoUnitarioCentavos}
                          aoSalvar={(centavos) =>
                            acao(() => enviar(`/api/catalogo/ferragens/${f.id}`, "PATCH", { precoUnitarioCentavos: centavos }), ferragens.mutate)
                          }
                        />
                      ) : (
                        formatarReais(f.precoUnitarioCentavos)
                      )}
                    </td>
                    {editavel && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => acao(() => enviar(`/api/catalogo/ferragens/${f.id}`, "DELETE"), ferragens.mutate)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          remover
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </Tabela>
            )}
          </Card>
        </>
      )}

      {aba === "cores" && (
        <>
          {editavel && (
            <FormularioNovo
              titulo="Nova cor"
              campos={[
                { chave: "nome", rotulo: "Nome", tipo: "texto" },
                { chave: "hex", rotulo: "Cor (#RRGGBB)", tipo: "texto", padrao: "#CCCCCC" },
                { chave: "fatorAluminio", rotulo: "Fator no perfil", tipo: "decimal", padrao: "1" },
                { chave: "fatorFerragem", rotulo: "Fator na ferragem", tipo: "decimal", padrao: "1" },
              ]}
              aoSalvar={(dados) => acao(() => enviar("/api/catalogo/cores", "POST", dados), cores.mutate)}
            />
          )}

          <Card>
            {!cores.data || cores.data.length === 0 ? (
              <Vazio titulo="Nenhuma cor cadastrada" />
            ) : (
              <Tabela cabecalho={["Cor", "Fator perfil", "Fator ferragem", ...(editavel ? [""] : [])]}>
                {cores.data.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border border-neutral-300" style={{ background: c.hex }} />
                        <span className="font-medium text-neutral-900">{c.nome}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      ×{c.fatorAluminio} {c.fatorAluminio !== 1 && <span className="text-xs text-neutral-500">(+{Math.round((c.fatorAluminio - 1) * 100)}%)</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">×{c.fatorFerragem}</td>
                    {editavel && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => acao(() => enviar(`/api/catalogo/cores/${c.id}`, "DELETE"), cores.mutate)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          desativar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </Tabela>
            )}
          </Card>
        </>
      )}
    </>
  );
}

const OPCOES_SIM_NAO = [
  { valor: "nao", texto: "Não" },
  { valor: "sim", texto: "Sim" },
];

type CampoForm = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "inteiro" | "decimal" | "moeda" | "selecao" | "booleano";
  padrao?: string;
  opcoes?: Array<{ valor: string; texto: string }>;
};

/**
 * Formulário de cadastro genérico das abas.
 *
 * Existe porque as quatro abas cadastram coisas diferentes com a MESMA
 * mecânica; escrever quatro formulários faria os quatro divergirem — e a
 * conversão de "94,99" pra centavos precisaria estar certa nos quatro.
 */
function FormularioNovo({ titulo, campos, aoSalvar }: { titulo: string; campos: CampoForm[]; aoSalvar: (dados: Record<string, unknown>) => void }) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map((c) => [c.chave, c.padrao ?? ""])),
  );

  if (!aberto) {
    return (
      <div className="mb-4">
        <Botao onClick={() => setAberto(true)}>{titulo}</Botao>
      </div>
    );
  }

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-3 font-medium text-neutral-900">{titulo}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {campos.map((campo) => (
          <Campo key={campo.chave} rotulo={campo.rotulo}>
            {campo.tipo === "selecao" || campo.tipo === "booleano" ? (
              <Selecao value={valores[campo.chave]} onChange={(e) => setValores((v) => ({ ...v, [campo.chave]: e.target.value }))}>
                {(campo.opcoes ?? (campo.tipo === "booleano" ? OPCOES_SIM_NAO : [])).map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.texto}
                  </option>
                ))}
              </Selecao>
            ) : (
              <Entrada
                value={valores[campo.chave]}
                inputMode={campo.tipo === "texto" ? undefined : "decimal"}
                onChange={(e) => setValores((v) => ({ ...v, [campo.chave]: e.target.value }))}
              />
            )}
          </Campo>
        ))}
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Botao variante="secundario" onClick={() => setAberto(false)}>
          Cancelar
        </Botao>
        <Botao
          onClick={() => {
            const dados: Record<string, unknown> = {};
            for (const campo of campos) {
              const bruto = valores[campo.chave] ?? "";
              dados[campo.chave] =
                campo.tipo === "moeda"
                  ? lerCentavos(bruto)
                  : campo.tipo === "inteiro"
                    ? Math.round(Number(bruto.replace(",", ".")) || 0)
                    : campo.tipo === "decimal"
                      ? Number(bruto.replace(",", ".")) || 0
                      : campo.tipo === "booleano"
                        ? bruto === "sim"
                        : bruto;
            }
            aoSalvar(dados);
            setAberto(false);
            setValores(Object.fromEntries(campos.map((c) => [c.chave, c.padrao ?? ""])));
          }}
        >
          Salvar
        </Botao>
      </div>
    </Card>
  );
}

/** Preço editável direto na tabela: mudar o kg do alumínio é semanal. */
function CampoPrecoInline({ valorCentavos, aoSalvar }: { valorCentavos: number; aoSalvar: (centavos: number) => void }) {
  return (
    <input
      defaultValue={(valorCentavos / 100).toFixed(2).replace(".", ",")}
      inputMode="decimal"
      onBlur={(e) => {
        const centavos = lerCentavos(e.target.value);
        e.target.value = (centavos / 100).toFixed(2).replace(".", ",");
        if (centavos !== valorCentavos) aoSalvar(centavos);
      }}
      className="w-28 rounded-lg border border-neutral-300 bg-surface px-2 py-1 text-sm text-neutral-900 outline-none focus:border-accent"
    />
  );
}
