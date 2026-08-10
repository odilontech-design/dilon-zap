/**
 * Símbolo da marca Dilon Tech: o 'D' segmentado em polígonos (dados, módulos
 * de software, processos organizados) atravessado pela seta ascendente
 * projetada pro quadrante superior direito (crescimento, ganho de eficiência).
 * Ver Manual de Identidade Visual v1.0, seção 2.
 *
 * Vem sobre o círculo Deep Navy Blue igual ao ativo oficial — além de ser a
 * aplicação que a marca já usa como avatar, garante o contraste do azul e do
 * teal em qualquer fundo onde a barra lateral for parar.
 *
 * Desenhado pra continuar legível a 28px (tamanho no menu recolhido): a
 * silhueta do 'D' e o vazado interno vêm primeiro, a seta é fina o bastante
 * pra cruzar sem tapar a letra, e há só dois cortes de segmentação — mais do
 * que isso vira ruído nesse tamanho.
 *
 * Cores travadas nos valores do manual de propósito (alterar a paleta é
 * proibido): Deep Navy #03254C e Electric Teal #00F5D4.
 */
export function DilonMark({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`${className} shrink-0`} role="img" aria-label="Dilon Tech">
      <defs>
        <linearGradient id="dilon-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4A90E2" />
          <stop offset="100%" stopColor="#1257A0" />
        </linearGradient>
      </defs>

      <circle cx="24" cy="24" r="24" fill="#03254C" />

      {/* 'D': contorno externo e contraforma no mesmo path, evenodd vaza o miolo. */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="url(#dilon-d)"
        d="M11 9h13.5C33.6 9 40 15.3 40 24s-6.4 15-15.5 15H11V9zm8 7.5v15h5.2c4.7 0 7.6-2.9 7.6-7.5s-2.9-7.5-7.6-7.5H19z"
      />

      {/* Cortes que dão a leitura de polígonos montados, na cor do fundo. */}
      <g stroke="#03254C" strokeWidth="1.6">
        <path d="M11 24h8M24.5 9 19 16.5" />
      </g>

      {/* Seta ascendente cruzando o símbolo. */}
      <path
        d="M9 36C17 34 26 28 33 16.5"
        fill="none"
        stroke="#00F5D4"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path d="M38.5 10.5 28.5 13.5l7 7z" fill="#00F5D4" />
    </svg>
  );
}
