"use client";

import { createContext, useContext } from "react";
import type { Recurso } from "@/lib/plano-regras";

/**
 * Os recursos ativos da empresa, disponíveis pra qualquer tela.
 *
 * Carregado uma vez no layout (no servidor) e distribuído por aqui. Existe por
 * causa de um erro concreto: o Inbox busca os pedidos da conversa a cada 30s,
 * e com Pedidos fora do plano a rota devolve um objeto de erro no lugar da
 * lista — o `.filter` em cima disso derrubaria a tela principal do produto.
 * Desligar um módulo secundário não pode quebrar o que é central.
 *
 * Isto é só pra ESCONDER. Quem bloqueia de verdade é o servidor
 * (lib/plano.ts); saber aqui que um recurso está desligado evita a chamada, o
 * botão e a recusa, mas não é a barreira.
 */
const RecursosContext = createContext<Set<Recurso> | null>(null);
const TermoPedidoContext = createContext<string>("Pedido");

export function RecursosProvider({
  recursos,
  termoPedido,
  children,
}: {
  recursos: Recurso[];
  /** Como a empresa chama o pedido ("Pedido" ou "Orçamento"). Ver Tenant.termoPedido. */
  termoPedido?: string | null;
  children: React.ReactNode;
}) {
  return (
    <RecursosContext.Provider value={new Set(recursos)}>
      <TermoPedidoContext.Provider value={termoPedido || "Pedido"}>{children}</TermoPedidoContext.Provider>
    </RecursosContext.Provider>
  );
}

/**
 * O nome do pedido nas telas, nas quatro formas que o texto usa. A Hemoderi
 * trabalha com orçamento de serviço e pediu "Orçamento" (13/10); o resto
 * continua "Pedido".
 */
export function useTermoPedido() {
  const termo = useContext(TermoPedidoContext);
  return termosDoPedido(termo);
}

export function termosDoPedido(termo: string | null | undefined) {
  const t = termo || "Pedido";
  const plural = t === "Orçamento" ? "Orçamentos" : "Pedidos";
  return { singular: t, plural, minusculo: t.toLowerCase(), pluralMinusculo: plural.toLowerCase(), artigo: "o" };
}

/**
 * Se o recurso está ativo pra esta empresa.
 *
 * Sem provider (uma tela fora do layout do painel, um teste) responde true:
 * esconder por falta de contexto seria sumir com um recurso pago por engano,
 * e o servidor continua barrando o que de fato está fora do plano.
 */
export function useRecurso(recurso: Recurso) {
  const recursos = useContext(RecursosContext);
  return recursos === null ? true : recursos.has(recurso);
}
