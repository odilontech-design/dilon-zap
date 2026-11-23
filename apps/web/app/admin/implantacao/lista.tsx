"use client";

import Link from "next/link";
import useSWR from "swr";

type Linha = {
  id: string;
  nome: string;
  plano: string | null;
  percentual: number;
  feitos: number;
  total: number;
  pendentes: string[];
  diasDesdeAEntrada: number;
  noPatio: number;
  semKm: number;
  semFoto: number;
  semPreco: number;
  portaisConectados: string[];
  anunciosNoAr: number;
  usouOInbox: boolean;
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const NOME_PLANO: Record<string, string> = { GARAGEM: "Garagem", REVENDA: "Revenda", REVENDA_MAIS: "Revenda+" };

/** Todas as revendas e o andamento de cada implantação: quem está parado há dias aparece no topo. */
export function ListaDeImplantacoes() {
  const { data } = useSWR<{ revendas: Linha[] }>("/api/admin/implantacao", fetcher);
  if (!data) return <p className="text-sm text-neutral-400">Carregando…</p>;
  // Quem ainda não terminou e entrou há mais tempo primeiro (é onde a Dilon Tech precisa agir).
  const ordenadas = [...data.revendas].sort((a, b) => Number(a.percentual === 100) - Number(b.percentual === 100) || b.diasDesdeAEntrada - a.diasDesdeAEntrada);
  const emAndamento = ordenadas.filter((r) => r.percentual < 100).length;
  return (
    <div className="mx-auto max-w-6xl" data-testid="implantacoes">
      <h1 className="text-lg font-semibold text-neutral-100">Implantação das revendas</h1>
      <p className="mb-4 text-sm text-neutral-400">{data.revendas.length} revenda(s), {emAndamento} em andamento. Cada passo se marca sozinho a partir dos dados da loja.</p>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs text-neutral-500">
            <tr><th className="px-3 py-2">Revenda</th><th className="px-3 py-2">Plano</th><th className="px-3 py-2">Implantação</th><th className="px-3 py-2 text-right">Dias</th><th className="px-3 py-2 text-right">Carros</th><th className="px-3 py-2 text-right">Sem km</th><th className="px-3 py-2">Portais</th><th className="px-3 py-2">O que falta</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 text-neutral-200">
            {ordenadas.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium"><Link href={`/admin/tenants/${r.id}`} className="hover:underline">{r.nome}</Link></td>
                <td className="px-3 py-2 text-neutral-400">{r.plano ? NOME_PLANO[r.plano] : "—"}</td>
                <td className="px-3 py-2"><div className="flex items-center gap-2"><span className="h-1.5 w-24 rounded-full bg-neutral-800"><span className={`block h-1.5 rounded-full ${r.percentual === 100 ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${r.percentual}%` }} /></span><span className="text-xs">{r.percentual}%</span></div></td>
                <td className={`px-3 py-2 text-right ${r.percentual < 100 && r.diasDesdeAEntrada >= 7 ? "font-semibold text-amber-400" : ""}`}>{r.diasDesdeAEntrada}</td>
                <td className="px-3 py-2 text-right">{r.noPatio}</td>
                <td className={`px-3 py-2 text-right ${r.semKm ? "text-amber-400" : ""}`}>{r.semKm}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{r.portaisConectados.join(", ") || "—"}</td>
                <td className="px-3 py-2 text-xs text-neutral-400">{r.pendentes.join(" · ") || "Tudo certo"}</td>
              </tr>
            ))}
            {ordenadas.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-neutral-500">Nenhuma revenda com o recurso ligado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
