"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { formatarReais } from "@dilon-zap/esquadrias-core";
import type { PapelUsuario, StatusOrcamento } from "@dilon-zap/erp-db";
import { Botao, Entrada, Selecao } from "@/components/campos";
import { Card, Etiqueta, Tabela, TituloPagina, Vazio, type Tom } from "@/components/ui";
import { buscar, enviar } from "@/lib/fetcher";
import { vePreco } from "@/lib/papeis";

type OrcamentoLista = {
  id: string;
  numero: number;
  titulo: string;
  status: StatusOrcamento;
  totalCentavos: number;
  criadoEm: string;
  validoAte: string | null;
  cliente: { id: string; nome: string } | null;
  vendedor: { id: string; nome: string } | null;
  _count: { itens: number };
};

const TOM: Record<StatusOrcamento, Tom> = {
  RASCUNHO: "neutro",
  ENVIADO: "azul",
  APROVADO: "verde",
  REPROVADO: "vermelho",
  EXPIRADO: "amarelo",
};

export function ListaOrcamentos({ papel }: { papel: PapelUsuario }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const query = new URLSearchParams({ ...(busca ? { busca } : {}), ...(status ? { status } : {}) }).toString();
  const { data, isLoading } = useSWR<OrcamentoLista[]>(`/api/orcamentos?${query}`, buscar);

  const mostrarValores = vePreco(papel);

  async function criar() {
    setCriando(true);
    setErro(null);
    try {
      const novo = await enviar<{ id: string }>("/api/orcamentos", "POST", { titulo: "Orçamento" });
      router.push(`/orcamentos/${novo.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível criar");
      setCriando(false);
    }
  }

  return (
    <>
      <TituloPagina
        titulo="Orçamentos"
        descricao="Escolha a tipologia, informe o vão e o sistema calcula corte, vidro, ferragem e preço."
        acao={
          <Botao onClick={criar} disabled={criando}>
            {criando ? "Criando…" : "Novo orçamento"}
          </Botao>
        }
      />

      {erro && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      <div className="mb-4 flex flex-wrap gap-3">
        <Entrada
          placeholder="Buscar por número, título ou cliente"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Selecao value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[180px]">
          <option value="">Todos os status</option>
          <option value="RASCUNHO">Rascunho</option>
          <option value="ENVIADO">Enviado</option>
          <option value="APROVADO">Aprovado</option>
          <option value="REPROVADO">Reprovado</option>
          <option value="EXPIRADO">Expirado</option>
        </Selecao>
      </div>

      <Card>
        {isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Carregando…</p>
        ) : !data || data.length === 0 ? (
          <Vazio
            titulo={busca || status ? "Nenhum orçamento com esse filtro" : "Nenhum orçamento ainda"}
            descricao={busca || status ? undefined : "Crie o primeiro e veja o custo e a margem antes de mandar o preço pro cliente."}
          />
        ) : (
          <Tabela cabecalho={["Nº", "Título", "Cliente", "Itens", ...(mostrarValores ? ["Total"] : []), "Status", ""]}>
            {data.map((o) => (
              <tr key={o.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 text-neutral-500">#{o.numero}</td>
                <td className="px-4 py-3">
                  <Link href={`/orcamentos/${o.id}`} className="font-medium text-neutral-900 hover:text-accent">
                    {o.titulo}
                  </Link>
                  <p className="text-xs text-neutral-500">{new Date(o.criadoEm).toLocaleDateString("pt-BR")}</p>
                </td>
                <td className="px-4 py-3 text-neutral-700">{o.cliente?.nome ?? <span className="text-neutral-400">—</span>}</td>
                <td className="px-4 py-3 text-neutral-700">{o._count.itens}</td>
                {mostrarValores && <td className="px-4 py-3 font-medium text-neutral-900">{formatarReais(o.totalCentavos)}</td>}
                <td className="px-4 py-3">
                  <Etiqueta tom={TOM[o.status]}>{o.status.toLowerCase()}</Etiqueta>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/orcamentos/${o.id}`} className="text-sm text-accent hover:underline">
                    abrir
                  </Link>
                </td>
              </tr>
            ))}
          </Tabela>
        )}
      </Card>
    </>
  );
}
