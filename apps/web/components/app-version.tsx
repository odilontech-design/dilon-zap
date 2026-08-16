const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "?";
const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE;

function formatBuildDate(iso: string | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Versão do sistema no rodapé do menu. Serve pra suporte: quando alguém
 * reporta um problema, a versão + data do build dizem exatamente qual código
 * a pessoa está usando (e se a correção de ontem já chegou na máquina dela).
 */
export function AppVersion({ compact = false }: { compact?: boolean }) {
  const built = formatBuildDate(BUILD_DATE);
  const title = built ? `Versão ${VERSION} · atualizado em ${built}` : `Versão ${VERSION}`;

  return (
    <p
      title={title}
      className={`font-mono tabular-nums text-[10px] text-neutral-400 shrink-0 ${compact ? "text-center" : ""}`}
    >
      v{VERSION}
    </p>
  );
}
