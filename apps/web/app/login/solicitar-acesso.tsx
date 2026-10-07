"use client";

import { useState } from "react";
import { linkComMensagem } from "@/lib/suporte";
import { documentoValido, formatarDocumentoBR } from "@/lib/documento";

/**
 * Autocadastro, abaixo do formulário de entrada.
 *
 * Antes isto só montava uma mensagem de WhatsApp e abria a conversa — nada era
 * guardado. Com tráfego pago apontando pra cá, quem chega fora do horário ou
 * desiste no meio do caminho se perdia. Agora o pedido fica registrado e entra
 * numa fila de aprovação no painel da Dilon Tech.
 *
 * Continua recolhido por padrão: quem trabalha aqui todo dia não pode ter um
 * formulário de vendas empurrando o campo de senha pra baixo.
 *
 * O WhatsApp não sumiu — virou o passo DEPOIS do envio, pra quem quer falar na
 * hora. Antes era o único caminho, e dependia de a pessoa ter WhatsApp no
 * computador em que estava.
 */
export function SolicitarAcesso({ numero }: { numero: string }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [documento, setDocumento] = useState("");
  // Campo-armadilha: fica escondido e nenhum humano preenche. Ver /api/cadastro.
  const [website, setWebsite] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  // Validação frouxa de propósito no e-mail: o navegador já barra o formato, e
  // regra rigorosa demais rejeita endereço válido e trava a venda. O documento
  // é a exceção — ali o dígito verificador é conferido de verdade, senão o
  // cadastro chega inaproveitável do outro lado.
  const emailOk = /.+@.+\..+/.test(email.trim());
  const documentoOk = documentoValido(documento);
  const podeEnviar =
    nome.trim().length > 1 &&
    empresa.trim().length > 1 &&
    emailOk &&
    telefone.trim().length >= 8 &&
    documentoOk &&
    !enviando;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;

    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          empresa: empresa.trim(),
          email: email.trim(),
          telefone: telefone.trim(),
          documento,
          website,
        }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(typeof b.error === "string" ? b.error : "não deu pra enviar. Tente de novo.");
        return;
      }
      setEnviado(true);
    } catch {
      setErro("não deu pra enviar — confira sua conexão e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-accent hover:text-accent"
      >
        Quero conhecer o Dilon Zap
      </button>
    );
  }

  if (enviado) {
    const texto = `Olá! Acabei de me cadastrar no Dilon Zap como ${empresa.trim()} e gostaria de falar com vocês.`;
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-surface p-5 text-center">
        <p className="text-sm font-semibold">Cadastro enviado</p>
        {/* Não promete e-mail: o sistema não envia, e quem repassa os dados de
            entrada é a Dilon Tech. Prometer "você recebe no e-mail" gerava a
            pergunta "cadê meu e-mail?" assim que o tráfego pago chegasse. */}
        <p className="text-xs text-neutral-600">
          Recebemos seu pedido. Vamos revisar e entrar em contato pelo telefone ou WhatsApp que você
          informou para liberar seu acesso.
        </p>
        <a
          href={linkComMensagem(numero, texto)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Falar agora no WhatsApp
        </a>
      </div>
    );
  }

  const campo =
    "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Criar minha conta</p>
          <p className="text-xs text-neutral-500">Revisamos e liberamos seu acesso.</p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="shrink-0 text-xs text-neutral-500 hover:text-neutral-800"
        >
          Fechar
        </button>
      </div>

      {/* Armadilha pra robô: invisível e fora da ordem de tabulação. Humano
          nunca vê nem alcança; robô que preenche tudo cai aqui. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-0 w-0 opacity-0"
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Seu nome</span>
        <input required value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Empresa</span>
        <input required value={empresa} onChange={(e) => setEmpresa(e.target.value)} className={campo} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">E-mail</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@suaempresa.com.br"
          className={campo}
        />
        {/* Diz pra que serve antes de a pessoa digitar: e-mail que vira login
            merece ser escolhido com cuidado, e trocar depois dá trabalho. */}
        <span className="text-xs text-neutral-500">Será o seu login no sistema.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Telefone</span>
        <input
          required
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          inputMode="tel"
          placeholder="(21) 99999-9999"
          className={campo}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">CPF ou CNPJ</span>
        <input
          required
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          onBlur={() => documentoOk && setDocumento(formatarDocumentoBR(documento))}
          inputMode="numeric"
          placeholder="Só os números"
          className={campo}
        />
        {/* Só reclama depois de a pessoa ter digitado o suficiente: acusar
            "inválido" no segundo dígito é o formulário brigando com quem está
            tentando preencher. */}
        {documento.replace(/\D/g, "").length >= 11 && !documentoOk && (
          <span className="text-xs text-red-600">Confira o número digitado.</span>
        )}
      </label>

      {erro && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>
      )}

      <button
        type="submit"
        disabled={!podeEnviar}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
      >
        {enviando ? "Enviando..." : "Enviar cadastro"}
      </button>
    </form>
  );
}
