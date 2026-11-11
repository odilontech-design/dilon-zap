import Link from "next/link";
import { PLANOS } from "@/lib/planos";
import { FormularioCadastro } from "./formulario";

const ITENS = [
  "Registro de ponto pelo app no celular ou pela web, com geolocalização",
  "Registro simples ou com foto",
  "Cálculo automático de horas trabalhadas, faltantes, atrasos, faltas, hora extra, banco de horas e adicional noturno",
  "Espelho de ponto e ajustes manuais",
  "Relatórios completos",
  "Até 2 turnos e 1 CNPJ",
  "Treinamento online ao vivo incluso",
  "Suporte humano por telefone e chat, sem limite",
];

export const dynamic = "force-dynamic";

export default function PaginaCadastro() {
  const fechado = process.env.PONTO_CADASTRO_FECHADO === "1";
  const plano = PLANOS.ESSENCIAL;

  return (
    <main className="min-h-screen p-5 md:p-10">
      <div className="mx-auto max-w-4xl grid md:grid-cols-2 gap-8">
        <section>
          <p className="text-sm font-medium text-accent">Plano {plano.nome}</p>
          <h1 className="text-2xl font-semibold text-neutral-900 mt-1">Ponto do mês calculado sozinho</h1>
          <p className="text-3xl font-semibold text-neutral-900 mt-4">
            R$ 59,90<span className="text-base font-normal text-neutral-500">/mês</span>
          </p>
          <p className="text-sm text-neutral-500">de 1 a {plano.maxColaboradores} colaboradores</p>
          <ul className="mt-6 space-y-2.5 text-sm text-neutral-700">
            {ITENS.map((i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">✓</span>
                {i}
              </li>
            ))}
          </ul>
          <p className="text-xs text-neutral-500 mt-6">
            O acesso é liberado assim que a conta é criada. Pagamento por boleto bancário.
          </p>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-surface p-6 h-fit">
          {fechado ? (
            <p className="text-sm text-neutral-700">
              A contratação pelo site está pausada no momento. Fale com a gente pelo WhatsApp ou telefone.
            </p>
          ) : (
            <FormularioCadastro />
          )}
          <p className="text-sm text-neutral-500 mt-5 text-center">
            Já tem conta?{" "}
            <Link href="/login" className="text-accent font-medium">
              Entrar
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
