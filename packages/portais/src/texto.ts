/** "Volkswagen Gol 1.0 MPI" → "volkswagen gol 1 0 mpi": sem acento, minúsculo, só letras e números. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
