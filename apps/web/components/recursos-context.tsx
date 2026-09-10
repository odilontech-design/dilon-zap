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

export function RecursosProvider({
  recursos,
  children,
}: {
  recursos: Recurso[];
  children: React.ReactNode;
}) {
  return <RecursosContext.Provider value={new Set(recursos)}>{children}</RecursosContext.Provider>;
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
