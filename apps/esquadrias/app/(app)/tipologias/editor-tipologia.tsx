"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Expansao } from "@dilon-zap/esquadrias-core";
import { AreaTexto, Botao, Campo, Entrada, Selecao } from "@/components/campos";
import { Card } from "@/components/ui";
import { enviar } from "@/lib/fetcher";

export type Opcoes = {
  perfis: Array<{ id: string; codigo: string; nome: string; comprimentoBarraMm: number }>;
  vidros: Array<{ id: string; nome: string }>;
  ferragens: Array<{ id: string; nome: string; unidade: string }>;
  linhas: Array<{ id: string; nome: string }>;
};

type Peca = { perfilId: string; descricao: string; corte: "RETO" | "ANGULO_45" | "ANGULO_45_DUPLO"; formulaQuantidade: string; formulaComprimento: string };
type Vidro = { vidroId: string; descricao: string; formulaQuantidade: string; formulaLargura: string; formulaAltura: string };
type Ferragem = { ferragemId: string; descricao: string; formulaQuantidade: string };
type Parametro = { chave: string; rotulo: string; valorPadrao: number };

export type TipologiaFormulario = {
  nome: string;
  categoria: string;
  descricao: string;
  linhaId: string;
  desenhoSvg: string;
  larguraMinMm: number;
  larguraMaxMm: number;
  alturaMinMm: number;
  alturaMaxMm: number;
  parametros: Parametro[];
  pecas: Peca[];
  vidros: Vidro[];
  ferragens: Ferragem[];
};

export const TIPOLOGIA_VAZIA: TipologiaFormulario = {
  nome: "",
  categoria: "JANELA",
  descricao: "",
  linhaId: "",
  desenhoSvg: "",
  larguraMinMm: 300,
  larguraMaxMm: 6000,
  alturaMinMm: 300,
  alturaMaxMm: 6000,
  parametros: [{ chave: "folga", rotulo: "Folga de montagem (mm)", valorPadrao: 10 }],
  pecas: [],
  vidros: [],
  ferragens: [],
};

const CATEGORIAS = ["JANELA", "PORTA", "BOX", "GUARDA_CORPO", "FACHADA", "VITRINE", "OUTRO"];

export function EditorTipologia({ tipologiaId, inicial, opcoes }: { tipologiaId?: string; inicial: TipologiaFormulario; opcoes: Opcoes }) {
  const router = useRouter();
  const [form, setForm] = useState<TipologiaFormulario>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [testeL, setTesteL] = useState(1200);
  const [testeH, setTesteH] = useState(1000);
  const [expansao, setExpansao] = useState<Expansao | null>(null);
  const [erroTeste, setErroTeste] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);

  const alterar = <K extends keyof TipologiaFormulario>(campo: K, valor: TipologiaFormulario[K]) =>
    setForm((atual) => ({ ...atual, [campo]: valor }));

  /** Variáveis disponíveis nas fórmulas — mostradas na tela pra não virar adivinhação. */
  const variaveis = ["L (largura)", "H (altura)", "Q (quantidade)", "AREA", "PERIMETRO", ...form.parametros.map((p) => p.chave)];

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const corpo = { ...form, linhaId: form.linhaId || null, descricao: form.descricao || null, desenhoSvg: form.desenhoSvg || null };
      if (tipologiaId) {
        await enviar(`/api/tipologias/${tipologiaId}`, "PUT", corpo);
      } else {
        const criada = await enviar<{ id: string }>("/api/tipologias", "POST", corpo);
        router.replace(`/tipologias/${criada.id}`);
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setErroTeste(null);
    try {
      const resultado = await enviar<{ expansao: Expansao }>("/api/tipologias/testar", "POST", {
        tipologia: { ...form, linhaId: form.linhaId || null, descricao: form.descricao || null, desenhoSvg: form.desenhoSvg || null },
        larguraMm: testeL,
        alturaMm: testeH,
        quantidade: 1,
      });
      setExpansao(resultado.expansao);
    } catch (e) {
      setExpansao(null);
      setErroTeste(e instanceof Error ? e.message : "não foi possível testar");
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <Entrada value={form.nome} onChange={(e) => alterar("nome", e.target.value)} placeholder="Janela 2 folhas de correr" />
            </Campo>
            <Campo rotulo="Categoria">
              <Selecao value={form.categoria} onChange={(e) => alterar("categoria", e.target.value)}>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c.toLowerCase().replace("_", " ")}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Linha de perfil">
              <Selecao value={form.linhaId} onChange={(e) => alterar("linhaId", e.target.value)}>
                <option value="">Sem linha</option>
                {opcoes.linhas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Descrição">
              <Entrada value={form.descricao} onChange={(e) => alterar("descricao", e.target.value)} />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            {(
              [
                ["larguraMinMm", "Largura mín. (mm)"],
                ["larguraMaxMm", "Largura máx. (mm)"],
                ["alturaMinMm", "Altura mín. (mm)"],
                ["alturaMaxMm", "Altura máx. (mm)"],
              ] as const
            ).map(([campo, rotulo]) => (
              <Campo key={campo} rotulo={rotulo}>
                <Entrada type="number" value={form[campo]} onChange={(e) => alterar(campo, Number(e.target.value) || 0)} />
              </Campo>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-medium text-neutral-900">Parâmetros</h2>
              <p className="text-xs text-neutral-500">Viram variáveis nas fórmulas e podem ser ajustados item a item no orçamento.</p>
            </div>
            <Botao
              variante="secundario"
              onClick={() => alterar("parametros", [...form.parametros, { chave: "", rotulo: "", valorPadrao: 0 }])}
            >
              Adicionar
            </Botao>
          </div>

          <div className="space-y-2">
            {form.parametros.map((p, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
                <Entrada placeholder="chave (folga)" value={p.chave} onChange={(e) => atualizarLista(form, alterar, "parametros", i, { chave: e.target.value })} />
                <Entrada placeholder="rótulo" value={p.rotulo} onChange={(e) => atualizarLista(form, alterar, "parametros", i, { rotulo: e.target.value })} />
                <Entrada
                  type="number"
                  className="sm:w-28"
                  value={p.valorPadrao}
                  onChange={(e) => atualizarLista(form, alterar, "parametros", i, { valorPadrao: Number(e.target.value) || 0 })}
                />
                <Botao variante="perigo" onClick={() => alterar("parametros", form.parametros.filter((_, j) => j !== i))}>
                  ✕
                </Botao>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-medium text-neutral-900">Cortes de alumínio</h2>
              <p className="text-xs text-neutral-500">Variáveis: {variaveis.join(", ")}</p>
            </div>
            <Botao
              variante="secundario"
              disabled={opcoes.perfis.length === 0}
              onClick={() =>
                alterar("pecas", [
                  ...form.pecas,
                  { perfilId: opcoes.perfis[0]?.id ?? "", descricao: "", corte: "RETO", formulaQuantidade: "2", formulaComprimento: "L" },
                ])
              }
            >
              Adicionar peça
            </Botao>
          </div>

          <div className="space-y-3">
            {form.pecas.map((p, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-neutral-200 p-3 sm:grid-cols-2">
                <Campo rotulo="Descrição">
                  <Entrada value={p.descricao} onChange={(e) => atualizarLista(form, alterar, "pecas", i, { descricao: e.target.value })} placeholder="Trilho superior" />
                </Campo>
                <Campo rotulo="Perfil">
                  <Selecao value={p.perfilId} onChange={(e) => atualizarLista(form, alterar, "pecas", i, { perfilId: e.target.value })}>
                    {opcoes.perfis.map((perfil) => (
                      <option key={perfil.id} value={perfil.id}>
                        {perfil.codigo} — {perfil.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Quantidade (fórmula)">
                  <Entrada value={p.formulaQuantidade} onChange={(e) => atualizarLista(form, alterar, "pecas", i, { formulaQuantidade: e.target.value })} />
                </Campo>
                <Campo rotulo="Comprimento em mm (fórmula)">
                  <Entrada value={p.formulaComprimento} onChange={(e) => atualizarLista(form, alterar, "pecas", i, { formulaComprimento: e.target.value })} />
                </Campo>
                <Campo rotulo="Tipo de corte">
                  <Selecao value={p.corte} onChange={(e) => atualizarLista(form, alterar, "pecas", i, { corte: e.target.value as Peca["corte"] })}>
                    <option value="RETO">Reto (90°)</option>
                    <option value="ANGULO_45">45° em uma ponta</option>
                    <option value="ANGULO_45_DUPLO">45° nas duas pontas</option>
                  </Selecao>
                </Campo>
                <div className="flex items-end">
                  <Botao variante="perigo" onClick={() => alterar("pecas", form.pecas.filter((_, j) => j !== i))}>
                    Remover peça
                  </Botao>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium text-neutral-900">Vidros</h2>
            <Botao
              variante="secundario"
              disabled={opcoes.vidros.length === 0}
              onClick={() =>
                alterar("vidros", [
                  ...form.vidros,
                  { vidroId: opcoes.vidros[0]?.id ?? "", descricao: "", formulaQuantidade: "1", formulaLargura: "L - 100", formulaAltura: "H - 100" },
                ])
              }
            >
              Adicionar vidro
            </Botao>
          </div>

          <div className="space-y-3">
            {form.vidros.map((v, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-neutral-200 p-3 sm:grid-cols-2">
                <Campo rotulo="Descrição">
                  <Entrada value={v.descricao} onChange={(e) => atualizarLista(form, alterar, "vidros", i, { descricao: e.target.value })} />
                </Campo>
                <Campo rotulo="Vidro">
                  <Selecao value={v.vidroId} onChange={(e) => atualizarLista(form, alterar, "vidros", i, { vidroId: e.target.value })}>
                    {opcoes.vidros.map((vidro) => (
                      <option key={vidro.id} value={vidro.id}>
                        {vidro.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Quantidade (fórmula)">
                  <Entrada value={v.formulaQuantidade} onChange={(e) => atualizarLista(form, alterar, "vidros", i, { formulaQuantidade: e.target.value })} />
                </Campo>
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Largura (fórmula)">
                    <Entrada value={v.formulaLargura} onChange={(e) => atualizarLista(form, alterar, "vidros", i, { formulaLargura: e.target.value })} />
                  </Campo>
                  <Campo rotulo="Altura (fórmula)">
                    <Entrada value={v.formulaAltura} onChange={(e) => atualizarLista(form, alterar, "vidros", i, { formulaAltura: e.target.value })} />
                  </Campo>
                </div>
                <div className="sm:col-span-2">
                  <Botao variante="perigo" onClick={() => alterar("vidros", form.vidros.filter((_, j) => j !== i))}>
                    Remover vidro
                  </Botao>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium text-neutral-900">Ferragens e acessórios</h2>
            <Botao
              variante="secundario"
              disabled={opcoes.ferragens.length === 0}
              onClick={() =>
                alterar("ferragens", [...form.ferragens, { ferragemId: opcoes.ferragens[0]?.id ?? "", descricao: "", formulaQuantidade: "1" }])
              }
            >
              Adicionar ferragem
            </Botao>
          </div>

          <div className="space-y-2">
            {form.ferragens.map((f, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
                <Entrada placeholder="Descrição" value={f.descricao} onChange={(e) => atualizarLista(form, alterar, "ferragens", i, { descricao: e.target.value })} />
                <Selecao value={f.ferragemId} onChange={(e) => atualizarLista(form, alterar, "ferragens", i, { ferragemId: e.target.value })}>
                  {opcoes.ferragens.map((ferragem) => (
                    <option key={ferragem.id} value={ferragem.id}>
                      {ferragem.nome} ({ferragem.unidade})
                    </option>
                  ))}
                </Selecao>
                <Entrada placeholder="qtd" value={f.formulaQuantidade} onChange={(e) => atualizarLista(form, alterar, "ferragens", i, { formulaQuantidade: e.target.value })} />
                <Botao variante="perigo" onClick={() => alterar("ferragens", form.ferragens.filter((_, j) => j !== i))}>
                  ✕
                </Botao>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <Campo rotulo="Desenho esquemático (SVG)" ajuda="Aparece na escolha da tipologia e na proposta. Opcional.">
            <AreaTexto rows={3} value={form.desenhoSvg} onChange={(e) => alterar("desenhoSvg", e.target.value)} className="font-mono text-xs" />
          </Campo>
        </Card>

        {erro && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => router.push("/tipologias")}>
            Voltar
          </Botao>
          <Botao onClick={salvar} disabled={salvando || !form.nome}>
            {salvando ? "Salvando…" : "Salvar tipologia"}
          </Botao>
        </div>
      </div>

      {/* Painel de teste. Fica grudado na lateral porque é usado JUNTO com a
          edição: mudou a fórmula, testa, confere o corte, ajusta de novo. */}
      <div className="xl:sticky xl:top-6 xl:self-start">
        <Card className="space-y-3 p-4">
          <h2 className="font-medium text-neutral-900">Testar</h2>
          <p className="text-xs text-neutral-500">Informe um vão e veja o que a tipologia gera — antes de salvar.</p>

          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Largura (mm)">
              <Entrada type="number" value={testeL} onChange={(e) => setTesteL(Number(e.target.value) || 0)} />
            </Campo>
            <Campo rotulo="Altura (mm)">
              <Entrada type="number" value={testeH} onChange={(e) => setTesteH(Number(e.target.value) || 0)} />
            </Campo>
          </div>

          <Botao onClick={testar} disabled={testando || form.pecas.length + form.vidros.length + form.ferragens.length === 0} className="w-full">
            {testando ? "Calculando…" : "Testar tipologia"}
          </Botao>

          {erroTeste && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{erroTeste}</p>}

          {expansao && (
            <div className="space-y-3 text-sm">
              <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
                {expansao.pecas.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2 px-3 py-1.5">
                    <span className="min-w-0 truncate text-neutral-700">{p.descricao}</span>
                    <span className="shrink-0 text-neutral-900">
                      {p.quantidade} × {p.comprimentoMm}
                    </span>
                  </li>
                ))}
                {expansao.vidros.map((v, i) => (
                  <li key={`v${i}`} className="flex justify-between gap-2 px-3 py-1.5">
                    <span className="min-w-0 truncate text-neutral-700">{v.vidroNome}</span>
                    <span className="shrink-0 text-neutral-900">
                      {v.quantidade} × {v.larguraMm}×{v.alturaMm}
                    </span>
                  </li>
                ))}
                {expansao.ferragens.map((f, i) => (
                  <li key={`f${i}`} className="flex justify-between gap-2 px-3 py-1.5">
                    <span className="min-w-0 truncate text-neutral-700">{f.ferragemNome}</span>
                    <span className="shrink-0 text-neutral-900">
                      {f.quantidade} {f.unidade}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-neutral-500">
                {expansao.pesoTotalKg.toFixed(2)} kg de alumínio · área {expansao.areaM2.toFixed(2)} m²
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * Atualiza um item de uma das listas do formulário.
 *
 * Recebe o `alterar` do componente em vez de mexer no estado direto pra não
 * duplicar a função em cada uma das quatro listas — e para que a alteração
 * continue sendo imutável (React não re-renderiza array mutado no lugar).
 */
function atualizarLista<K extends "parametros" | "pecas" | "vidros" | "ferragens">(
  form: TipologiaFormulario,
  alterar: <C extends keyof TipologiaFormulario>(campo: C, valor: TipologiaFormulario[C]) => void,
  lista: K,
  indice: number,
  mudanca: Partial<TipologiaFormulario[K][number]>,
) {
  const atual = form[lista] as TipologiaFormulario[K];
  alterar(
    lista,
    atual.map((item, i) => (i === indice ? { ...item, ...mudanca } : item)) as TipologiaFormulario[K],
  );
}
