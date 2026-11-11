"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Botao, Campo, Entrada, Selecao } from "@/components/campos";
import { desligar, novaSenha, reativar, salvarColaborador } from "./acoes";

type Dados = {
  id?: string;
  nome: string;
  cpf: string;
  pis: string;
  matricula: string;
  cargo: string;
  admissao: string;
  jornadaId: string;
  modoRegistro: "SIMPLES" | "COM_FOTO";
};

/**
 * O passo a passo que o administrador manda para o colaborador (WhatsApp,
 * papel, email). É a "inclusão dos colaboradores" do plano Essencial.
 */
function passoAPasso(endereco: string, login: string, senha: string) {
  return [
    "Olá! A partir de agora o nosso ponto é registrado pelo celular.",
    "",
    `1. Abra ${endereco} no navegador do celular.`,
    `2. Entre com o seu CPF (${login}) e a senha provisória ${senha}.`,
    "3. Crie a sua senha pessoal.",
    "4. Toque em \"Adicionar à tela inicial\" (Android: menu ⋮; iPhone: botão Compartilhar) para abrir como aplicativo.",
    "5. Na hora de entrar, sair e voltar do intervalo, toque em Registrar. Permita a localização (e a câmera, se pedir).",
    "",
    "Em \"Meu ponto\" você acompanha as suas horas e o banco de horas.",
  ].join("\n");
}

export function CartaoAcesso({ endereco, login, senha, aoFechar }: { endereco: string; login: string; senha: string; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const texto = passoAPasso(endereco, login, senha);
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3 text-sm">
      <p className="font-semibold text-emerald-700">Acesso criado</p>
      <p className="text-neutral-700">
        Login: <span className="font-mono">{login}</span> · Senha provisória: <span className="font-mono font-semibold">{senha}</span>
      </p>
      <p className="text-xs text-neutral-500">A senha aparece só agora. Envie o passo a passo abaixo para o colaborador.</p>
      <pre className="whitespace-pre-wrap rounded bg-surface border border-neutral-200 p-3 text-xs text-neutral-700">{texto}</pre>
      <div className="flex flex-wrap gap-2">
        <Botao
          variante="secundario"
          onClick={() => {
            navigator.clipboard?.writeText(texto).then(() => setCopiado(true));
          }}
        >
          {copiado ? "Copiado ✓" : "Copiar passo a passo"}
        </Botao>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          Enviar pelo WhatsApp
        </a>
        <Botao variante="secundario" onClick={aoFechar}>
          Fechar
        </Botao>
      </div>
    </div>
  );
}

export function FormularioColaborador({
  jornadas,
  inicial,
  endereco,
  limite = null,
}: {
  jornadas: Array<{ id: string; nome: string }>;
  inicial?: Dados;
  endereco: string;
  /** Mensagem de limite do plano; null = pode cadastrar. */
  limite?: string | null;
}) {
  const router = useRouter();
  const vazio: Dados = {
    nome: "",
    cpf: "",
    pis: "",
    matricula: "",
    cargo: "",
    admissao: new Date().toISOString().slice(0, 10),
    jornadaId: jornadas[0]?.id ?? "",
    modoRegistro: "SIMPLES",
  };
  const [f, setF] = useState<Dados>(inicial ?? vazio);
  const [erro, setErro] = useState<string | null>(null);
  const [acesso, setAcesso] = useState<{ login: string; senha: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const muda = (k: keyof Dados) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await salvarColaborador(f);
      if (!r.ok) return setErro(r.erro);
      if (r.dados) {
        setAcesso(r.dados);
        setF(vazio);
      } else {
        router.push("/colaboradores");
      }
    });
  }

  if (acesso) return <CartaoAcesso endereco={endereco} login={acesso.login} senha={acesso.senha} aoFechar={() => setAcesso(null)} />;
  if (limite && !inicial) return <p className="text-sm text-neutral-700">{limite}</p>;

  return (
    <form onSubmit={salvar} className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-neutral-900">{inicial ? "Editar colaborador" : "Novo colaborador"}</p>
        {inicial && (
          <Link href="/colaboradores" className="text-sm text-neutral-500">
            cancelar
          </Link>
        )}
      </div>
      <Campo rotulo="Nome completo">
        <Entrada required value={f.nome} onChange={muda("nome")} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="CPF" ajuda="É o login dele.">
          <Entrada required inputMode="numeric" value={f.cpf} onChange={muda("cpf")} />
        </Campo>
        <Campo rotulo="Admissão">
          <Entrada type="date" required value={f.admissao} onChange={muda("admissao")} />
        </Campo>
        <Campo rotulo="Cargo">
          <Entrada value={f.cargo} onChange={muda("cargo")} />
        </Campo>
        <Campo rotulo="Matrícula">
          <Entrada value={f.matricula} onChange={muda("matricula")} />
        </Campo>
      </div>
      <Campo rotulo="PIS (opcional)">
        <Entrada inputMode="numeric" value={f.pis} onChange={muda("pis")} />
      </Campo>
      <Campo rotulo="Jornada">
        <Selecao value={f.jornadaId} onChange={muda("jornadaId")}>
          {jornadas.map((j) => (
            <option key={j.id} value={j.id}>
              {j.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Forma de registro" ajuda="Com foto: tira uma selfie a cada marcação, para conferência.">
        <Selecao value={f.modoRegistro} onChange={muda("modoRegistro")}>
          <option value="SIMPLES">Registro simples</option>
          <option value="COM_FOTO">Registro simples com foto</option>
        </Selecao>
      </Campo>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <Botao type="submit" disabled={pendente} className="w-full">
        {pendente ? "Salvando…" : inicial ? "Salvar alterações" : "Cadastrar e gerar acesso"}
      </Botao>
    </form>
  );
}

export function AcoesColaborador({ id, ativo, endereco }: { id: string; ativo: boolean; endereco: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [acesso, setAcesso] = useState<{ login: string; senha: string } | null>(null);
  const [desligando, setDesligando] = useState(false);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));

  if (acesso) {
    return (
      <div className="w-full">
        <CartaoAcesso endereco={endereco} login={acesso.login} senha={acesso.senha} aoFechar={() => setAcesso(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Link href={`/colaboradores?editar=${id}`} className="text-accent">
        editar
      </Link>
      <Link href={`/ponto?colaborador=${id}`} className="text-accent">
        ponto
      </Link>
      {ativo ? (
        <>
          <button
            disabled={pendente}
            className="text-accent"
            onClick={() =>
              iniciar(async () => {
                const r = await novaSenha(id);
                if (r.ok && r.dados) setAcesso(r.dados);
                else if (!r.ok) setErro(r.erro);
              })
            }
          >
            nova senha
          </button>
          {desligando ? (
            <span className="flex items-center gap-1">
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="rounded border border-neutral-300 bg-surface px-1" />
              <button
                disabled={pendente}
                className="text-red-600"
                onClick={() =>
                  iniciar(async () => {
                    const r = await desligar(id, data);
                    if (!r.ok) setErro(r.erro);
                    setDesligando(false);
                  })
                }
              >
                confirmar
              </button>
            </span>
          ) : (
            <button className="text-red-600" onClick={() => setDesligando(true)}>
              desligar
            </button>
          )}
        </>
      ) : (
        <button
          disabled={pendente}
          className="text-accent"
          onClick={() =>
            iniciar(async () => {
              const r = await reativar(id);
              if (!r.ok) setErro(r.erro);
            })
          }
        >
          reativar
        </button>
      )}
      {erro && <span className="text-red-600">{erro}</span>}
    </div>
  );
}
