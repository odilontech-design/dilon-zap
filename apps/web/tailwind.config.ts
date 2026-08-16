import type { Config } from "tailwindcss";

// As cores vêm de variáveis CSS com os canais RGB soltos, e o `<alpha-value>`
// é o que mantém `bg-accent/10` e `bg-neutral-950/60` funcionando. Ver o
// comentário no topo de globals.css.
const tema = (nome: string) => `rgb(var(${nome}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: tema("--accent"),
        // Fundo de card. Existe separado de `white` de propósito: `text-white`
        // fica em cima de botão verde e de balão de mensagem colorido, onde
        // tem que continuar branco nos dois temas. Só o FUNDO branco vira
        // escuro — por isso são dois tokens e não um.
        surface: tema("--surface"),
        canvas: tema("--canvas"),
        // Sobrescreve a escala neutra do Tailwind: mesmos nomes de classe,
        // valor decidido pelo tema.
        neutral: {
          50: tema("--n-50"),
          100: tema("--n-100"),
          200: tema("--n-200"),
          300: tema("--n-300"),
          400: tema("--n-400"),
          500: tema("--n-500"),
          600: tema("--n-600"),
          700: tema("--n-700"),
          800: tema("--n-800"),
          900: tema("--n-900"),
          950: tema("--n-950"),
        },
      },
    },
  },
  plugins: [],
};

export default config;
