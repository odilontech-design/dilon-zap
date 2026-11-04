"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * /abrir-conversa?telefone=5521999999999&nome=Maria[&mensagem=...]
 *
 * Entrada para outros sistemas (ex.: os pedidos e as cabeleireiras do site da
 * Believe) falarem com um cliente pelo Inbox. Acha ou cria o contato pelo
 * telefone — mesmo caminho do "Novo contato", que resolve o JID certo e não
 * duplica — e só ABRE a conversa (assumir=0), sem tomar o atendimento de quem
 * já cuida dele.
 *
 * Com `mensagem`, mostra o texto e espera um clique em "Enviar": um link nunca
 * dispara mensagem sozinho (atualizar a página, pré-visualização de link ou
 * alguém colando a URL mandariam o mesmo texto de novo para o cliente).
 */
function AbrirConversa() {
  const router = useRouter();
  const params = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const iniciou = useRef(false);

  const digitos = (params.get("telefone") ?? "").replace(/\D/g, "");
  // Número brasileiro sem o 55 (DDD + número) ganha o código do país
  const telefone = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  const nome = params.get("nome")?.trim().slice(0, 120) || undefined;
  const mensagem = params.get("mensagem")?.trim().slice(0, 4000) || null;

  async function abrir(texto: string | null) {
    setErro(null);
    setEnviando(true);
    try {
      const contato = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: telefone, name: nome }),
      });
      if (!contato.ok) throw new Error("Não deu para encontrar o contato.");
      const { id } = await contato.json();

      const conversa = await fetch(`/api/contacts/${id}/start-conversation?assumir=0`, { method: "POST" });
      if (!conversa.ok) {
        const body = await conversa.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Não deu para abrir a conversa.");
      }
      const conversationId = (await conversa.json()).id;

      if (texto) {
        const envio = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, text: texto }),
        });
        if (!envio.ok) throw new Error("A conversa abriu, mas a mensagem não foi enviada. Envie pelo Inbox.");
      }
      router.replace(`/inbox?open=${conversationId}`);
    } catch (e: any) {
      setErro(e.message ?? "Não deu para abrir a conversa.");
      setEnviando(false);
    }
  }

  useEffect(() => {
    if (iniciou.current || mensagem) return;
    iniciou.current = true;
    if (telefone.length < 12) {
      setErro("Telefone inválido no link.");
      return;
    }
    abrir(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (mensagem) {
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="mb-1 text-lg font-semibold">Enviar mensagem{nome ? ` para ${nome}` : ""}</h1>
        <p className="mb-4 text-xs text-gray-500">+{telefone}</p>
        <div className="mb-4 whitespace-pre-wrap rounded border bg-gray-50 p-3 text-sm">{mensagem}</div>
        {telefone.length < 12 && <p className="mb-3 text-sm text-red-600">Telefone inválido no link.</p>}
        {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => abrir(mensagem)}
            disabled={enviando || telefone.length < 12}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {enviando ? "Enviando..." : "Enviar pelo Dilon Zap"}
          </button>
          <button
            onClick={() => abrir(null)}
            disabled={enviando || telefone.length < 12}
            className="rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            Só abrir a conversa
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-gray-500">
      {erro ?? "Abrindo a conversa..."}
    </div>
  );
}

export default function AbrirConversaPage() {
  return (
    <Suspense fallback={null}>
      <AbrirConversa />
    </Suspense>
  );
}
