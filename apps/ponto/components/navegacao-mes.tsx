import Link from "next/link";
import { maiuscula, nomeDoMes, somarMeses } from "@/lib/datas";

export function NavegacaoMes({ mes, href }: { mes: string; href: (mes: string) => string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-surface text-sm nao-imprimir">
      <Link href={href(somarMeses(mes, -1))} className="px-3 py-1.5 hover:bg-neutral-100 rounded-l-lg" aria-label="Mês anterior">
        ‹
      </Link>
      <span className="px-2 py-1.5 min-w-36 text-center">{maiuscula(nomeDoMes(mes))}</span>
      <Link href={href(somarMeses(mes, 1))} className="px-3 py-1.5 hover:bg-neutral-100 rounded-r-lg" aria-label="Próximo mês">
        ›
      </Link>
    </div>
  );
}
