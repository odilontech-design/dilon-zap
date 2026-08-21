"use client";

import { useState } from "react";
import useSWR from "swr";
import type { PapelUsuario } from "@dilon-zap/erp-db";
import { Botao, Campo, Entrada, Selecao } from "@/components/campos";
import { Card, Etiqueta, Tabela, TituloPagina } from "@/components/ui";
import { buscar, enviar } from "@/lib/fetcher";

type Membro = {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  telefone: string | null;
  comissaoPercent: number;
  desativadoEm: string | null;
};

const PAPEIS: Array<[PapelUsuario, string, string]> = [
  ["OWNER", "Responsável", "acesso total, inclusive financeiro e configurações"],
  ["GERENTE", "Gerente", "como o responsável, sem trocar o plano"],
  ["VENDEDOR", "Vendedor", "orçamentos e clientes; enxerga o custo pra negociar"],
  ["PRODUCAO", "Produção", "corte, materiais e obras — não vê preço de venda"],
  ["FINANCEIRO", "Financeiro", "contas a receber e a pagar"],
];

export function PainelEquipe({ limite, nomePlano, meuId }: { limite: number | null; nomePlano: string; meuId: string }) {
  const { data, mutate, isLoading } = useSWR<Membro[]>("/api/usuarios", buscar);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ativos = (data ?? []).filter((m) => !m.desativadoEm).length;

  async function acao(fn: () => Promise<unknown>) {
    setErro(null);
    try {
      await fn();
      mutate();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível concluir");
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Equipe"
        descricao={limite === null ? `Plano ${nomePlano}: usuários ilimitados.` : `Plano ${nomePlano}: ${ativos} de ${limite} usuários ativos.`}
        acao={<Botao onClick={() => setNovo((v) => !v)}>{novo ? "Fechar" : "Adicionar pessoa"}</Botao>}
      />

      {erro && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      {novo && <FormularioMembro aoSalvar={(dados) => acao(async () => { await enviar("/api/usuarios", "POST", dados); setNovo(false); })} />}

      <Card>
        {isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Carregando…</p>
        ) : (
          <Tabela cabecalho={["Nome", "Email", "Papel", "Comissão", "Status", ""]}>
            {(data ?? []).map((m) => (
              <tr key={m.id} className={m.desativadoEm ? "opacity-60" : ""}>
                <td className="px-4 py-3 font-medium text-neutral-900">{m.nome}</td>
                <td className="px-4 py-3 text-neutral-700">{m.email}</td>
                <td className="px-4 py-3">
                  <Selecao
                    value={m.papel}
                    disabled={m.id === meuId}
                    onChange={(e) => acao(() => enviar(`/api/usuarios/${m.id}`, "PATCH", { papel: e.target.value }))}
                    className="max-w-[150px]"
                  >
                    {PAPEIS.map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </Selecao>
                </td>
                <td className="px-4 py-3 text-neutral-700">{m.comissaoPercent}%</td>
                <td className="px-4 py-3">
                  <Etiqueta tom={m.desativadoEm ? "neutro" : "verde"}>{m.desativadoEm ? "desativado" : "ativo"}</Etiqueta>
                </td>
                <td className="px-4 py-3 text-right">
                  {m.id !== meuId && (
                    <button
                      onClick={() => acao(() => enviar(`/api/usuarios/${m.id}`, "PATCH", { ativo: Boolean(m.desativadoEm) }))}
                      className="text-sm text-accent hover:underline"
                    >
                      {m.desativadoEm ? "reativar" : "desativar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Tabela>
        )}
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="mb-2 font-medium text-neutral-900">O que cada papel enxerga</h2>
        <dl className="space-y-1 text-sm">
          {PAPEIS.map(([valor, rotulo, descricao]) => (
            <div key={valor} className="flex flex-wrap gap-2">
              <dt className="font-medium text-neutral-700">{rotulo}:</dt>
              <dd className="text-neutral-600">{descricao}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}

function FormularioMembro({ aoSalvar }: { aoSalvar: (dados: Record<string, unknown>) => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<PapelUsuario>("VENDEDOR");
  const [comissao, setComissao] = useState(0);

  return (
    <Card className="mb-4 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Nome">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="Email">
          <Entrada type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="Senha provisória" ajuda="Mínimo de 8 caracteres.">
          <Entrada type="text" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Campo rotulo="Papel">
          <Selecao value={papel} onChange={(e) => setPapel(e.target.value as PapelUsuario)}>
            {PAPEIS.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Comissão (%)">
          <Entrada type="number" min={0} max={100} value={comissao} onChange={(e) => setComissao(Number(e.target.value) || 0)} />
        </Campo>
      </div>

      <div className="mt-3 flex justify-end">
        <Botao disabled={nome.length < 2 || !email.includes("@") || senha.length < 8} onClick={() => aoSalvar({ nome, email, senha, papel, comissaoPercent: comissao })}>
          Adicionar
        </Botao>
      </div>
    </Card>
  );
}
