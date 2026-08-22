import type { Config } from "tailwindcss";

// Mesma estratégia do apps/web: a paleta vira variável CSS com os canais RGB
// soltos, e o `<alpha-value>` mantém `bg-accent/10` funcionando. Ver o
// comentário no topo de globals.css.
const tema = (nome: string) => `rgb(var(${nome}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: tema("--accent"),
        surface: tema("--surface"),
        canvas: tema("--canvas"),
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
