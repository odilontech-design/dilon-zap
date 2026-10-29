"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * /abrir-conversa?telefone=5521999999999&nome=Maria
 *
 * Entrada para outros sistemas (ex.: os pedidos do site da Believe) abrirem a
 * conversa com um cliente direto no Inbox. Acha ou cria o contato pelo
 * telefone — mesmo caminho do "Novo contato", que resolve o JID certo e não
 * duplica — e só ABRE a conversa (assumir=0), sem tomar o atendimento de quem
 * já cuida dele.
 */
function AbrirConversa() {
  const router = useRouter();
  const params = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const iniciou = useRef(false);

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;

    const digitos = (params.get("telefone") ?? "").replace(/\D/g, "");
    // Número brasileiro sem o 55 (DDD + número) ganha o código do país
    const telefone = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
    const nome = params.get("nome")?.trim().slice(0, 120) || undefined;

    if (telefone.length < 12) {
      setErro("Telefone inválido no link.");
      return;
    }

    (async () => {
      const contato = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: telefone, name: nome }),
      });
      if (!contato.ok) return setErro("Não deu para encontrar o contato.");
      const { id } = await contato.json();

      const conversa = await fetch(`/api/contacts/${id}/start-conversation?assumir=0`, { method: "POST" });
      if (!conversa.ok) {
        const body = await conversa.json().catch(() => ({}));
        return setErro(typeof body.error === "string" ? body.error : "Não deu para abrir a conversa.");
      }
      router.replace(`/inbox?open=${(await conversa.json()).id}`);
    })().catch(() => setErro("Não deu para abrir a conversa."));
  }, [params, router]);

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
