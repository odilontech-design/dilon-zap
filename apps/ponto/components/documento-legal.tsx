import Link from "@/components/link";

/** Página de texto legal: título, data de vigência e seções. */
export function DocumentoLegal({ titulo, vigencia, secoes }: { titulo: string; vigencia: string; secoes: Array<{ titulo: string; texto: string }> }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/login" className="text-sm text-accent">
        ← Voltar
      </Link>
      <h1 className="mt-6 text-2xl font-semibold text-neutral-900">{titulo}</h1>
      <p className="mt-1 text-sm text-neutral-500">Vigente desde {vigencia}</p>
      <div className="mt-8 space-y-7">
        {secoes.map((s) => (
          <section key={s.titulo}>
            <h2 className="font-semibold text-neutral-900">{s.titulo}</h2>
            <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-700">
              {s.texto.split("\n").map((p, i) =>
                p.startsWith("- ") ? (
                  <p key={i} className="pl-4 -indent-3">
                    • {p.slice(2)}
                  </p>
                ) : (
                  <p key={i}>{p}</p>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-10 text-xs text-neutral-500">
        Dilon Tech · CNPJ 64.601.665/0001-33 · Avenida Brasil, 115, Vila São Luis, Duque de Caxias/RJ · WhatsApp (21) 99399-9417
      </p>
    </main>
  );
}
