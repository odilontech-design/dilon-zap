"use client";

import { useRouter } from "next/navigation";
import { Selecao } from "@/components/campos";

export function SeletorPeriodo({ meses }: { meses: number }) {
  const router = useRouter();

  return (
    <Selecao value={meses} onChange={(e) => router.push(`/relatorios?meses=${e.target.value}`)} className="max-w-[180px]">
      <option value={3}>Últimos 3 meses</option>
      <option value={6}>Últimos 6 meses</option>
      <option value={12}>Últimos 12 meses</option>
      <option value={24}>Últimos 24 meses</option>
    </Selecao>
  );
}
