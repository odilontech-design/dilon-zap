import { ErroDeAcao } from "@/lib/acoes";
import type { UsuarioAtual } from "@/lib/session";

/**
 * CPF de quem está fazendo a alteração. A Portaria 671 (Anexo IX, item 6)
 * manda o REP guardar o responsável por toda inclusão ou alteração de empresa
 * e de colaborador, e o AFD grava esse CPF. Sem ele, a operação não é feita.
 */
export function cpfDoResponsavel(u: UsuarioAtual): string {
  if (!u.cpf) {
    throw new ErroDeAcao(
      "Informe o seu CPF em Configurações antes de alterar empresa ou colaboradores: o registro de ponto guarda quem fez cada alteração.",
    );
  }
  return u.cpf;
}
