"use client";

import { useEffect, useState } from "react";

export function AlternarTema() {
  const [tema, setTema] = useState<"light" | "dark">("light");

  // Lê o que o script inline do layout já aplicou, em vez de decidir de novo:
  // duas fontes de verdade divergiriam na primeira navegação.
  useEffect(() => {
    const atual = document.documentElement.getAttribute("data-theme");
    setTema(atual === "dark" ? "dark" : "light");
  }, []);

  function alternar() {
    const novo = tema === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try {
      localStorage.setItem("tema", novo);
    } catch {
      // Navegador com armazenamento bloqueado: o tema vale só nesta aba.
    }
    setTema(novo);
  }

  return (
    <button
      onClick={alternar}
      title={tema === "dark" ? "Tema claro" : "Tema escuro"}
      aria-label={tema === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
    >
      {tema === "dark" ? "☀" : "☾"}
    </button>
  );
}
