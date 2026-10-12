"use client";

import { useState } from "react";
import { linkComMensagem } from "@/lib/suporte";
import { FAIXAS_ATENDENTES, RAMOS } from "@/lib/qualificacao";

/**
 * Formulário de autocadastro do teste grátis — o mesmo na tela de login e na
 * página /cadastro, que é para onde o anúncio e o WhatsApp mandam o lead.
 *
 * Desenhado para o celular de quem acabou de tocar no anúncio:
 *  - CPF/CNPJ saiu. Pedir documento antes de a pessoa ver o sistema travava
 *    o cadastro; ele passa a ser pedido na ativação do plano, quando vira
 *    cobrança. A rota ainda aceita e valida, se um dia voltar a vir.
 *  - Ramo e tamanho da equipe entraram como escolha de um toque. São as
 *    perguntas que, feitas no WhatsApp, faziam a conversa morrer; aqui chegam
 *    no painel da Dilon Tech com o plano já sugerido.
 *
 * O prazo prometido ("até 30 minutos em horário comercial") é compromisso
 * comercial da Dilon Tech: se mudar, muda aqui.
 */
export function FormularioCadastro({
  numero,
  aoFechar,
}: {
  /** WhatsApp comercial, para o botão depois do envio. */
  numero: string;
  /** Na tela de login o formulário abre recolhido e pode ser fechado; na /cadastro não. */
  aoFechar?: () => void;
}) {
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [ramo, setRamo] = useState("");
  const [atendentes, setAtendentes] = useState("");
  // Campo-armadilha: fica escondido e nenhum humano preenche. Ver /api/cadastro.
  const [website, setWebsite] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  // Validação frouxa de propósito no e-mail: o navegador já barra o formato, e
  // regra rigorosa demais rejeita endereço válido e trava a venda.
  const emailOk = /.+@.+\..+/.test(email.trim());
  const digitosTelefone = telefone.replace(/\D/g, "").length;
  const podeEnviar =
    nome.trim().length > 1 &&
    empresa.trim().length > 1 &&
    digitosTelefone >= 10 &&
    emailOk &&
    ramo !== "" &&
    atendentes !== "" &&
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
          ramo,
          atendentes,
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

  if (enviado) {
    const texto = `Olá! Acabei de me cadastrar no Dilon Zap como ${empresa.trim()} e quero liberar meu teste grátis.`;
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-surface p-5 text-center">
        <p className="text-base font-semibold">Cadastro recebido! 🎉</p>
        {/* Não promete e-mail: o sistema não envia, e quem repassa os dados de
            entrada é a Dilon Tech pelo WhatsApp informado. */}
        <p className="text-sm text-neutral-600">
          Em horário comercial, liberamos seu acesso em até 30 minutos e te chamamos no WhatsApp
          que você informou para conectar seu número.
        </p>
        <a
          href={linkComMensagem(numero, texto)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-accent px-4 py-3 text-sm font-medium text-white hover:opacity-90"
        >
          Falar agora no WhatsApp
        </a>
      </div>
    );
  }

  // text-base (16px) nos campos: abaixo disso o iPhone dá zoom na página ao
  // tocar no campo, e o formulário "pula" na mão de quem está preenchendo.
  const campo =
    "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-accent";
  const rotulo = "font-medium text-neutral-700";

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">Teste grátis por 14 dias</p>
          <p className="text-xs text-neutral-500">Sem cartão de crédito. Leva 1 minuto.</p>
        </div>
        {aoFechar && (
          <button type="button" onClick={aoFechar} className="shrink-0 text-xs text-neutral-500 hover:text-neutral-800">
            Fechar
          </button>
        )}
      </div>

      {/* Armadilha pra robô: invisível e fora da ordem de tabulação. */}
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
        <span className={rotulo}>Seu nome</span>
        <input required autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={rotulo}>WhatsApp</span>
        <input
          required
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="(21) 99999-9999"
          className={campo}
        />
        <span className="text-xs text-neutral-500">É por aqui que te chamamos pra liberar o acesso.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={rotulo}>Nome da empresa</span>
        <input
          required
          autoComplete="organization"
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
          className={campo}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={rotulo}>E-mail</span>
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@suaempresa.com.br"
          className={campo}
        />
        {/* Diz pra que serve antes de a pessoa digitar: e-mail que vira login
            merece ser escolhido com cuidado, e trocar depois dá trabalho. */}
        <span className="text-xs text-neutral-500">Será seu login no Dilon Zap.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className={rotulo}>Ramo do negócio</span>
        <select required value={ramo} onChange={(e) => setRamo(e.target.value)} className={campo}>
          <option value="" disabled>
            Escolha
          </option>
          {RAMOS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      {/* Botões em vez de select: são quatro opções curtas, e um toque direto
          é mais rápido que abrir a lista no celular. */}
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className={`mb-1 ${rotulo}`}>Quantas pessoas atendem o WhatsApp hoje?</legend>
        <div className="grid grid-cols-2 gap-2">
          {FAIXAS_ATENDENTES.map((f) => {
            const ativo = atendentes === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                aria-pressed={ativo}
                onClick={() => setAtendentes(f.valor)}
                className={`rounded-md border px-3 py-2.5 text-sm transition ${
                  ativo
                    ? "border-accent bg-accent text-white"
                    : "border-neutral-300 text-neutral-700 hover:border-accent hover:text-accent"
                }`}
              >
                {f.rotulo}
              </button>
            );
          })}
        </div>
      </fieldset>

      {erro && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>
      )}

      <button
        type="submit"
        disabled={!podeEnviar}
        className="rounded-md bg-accent px-4 py-3 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
      >
        {enviando ? "Enviando..." : "Liberar meu teste grátis"}
      </button>
    </form>
  );
}
