import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * Link sem pré-carregamento.
 *
 * O <Link> do Next pré-carrega toda tela cujo link aparece na página. Aqui
 * quase toda tela é dinâmica (ponto ao vivo), então cada pré-carga é uma
 * execução no servidor: abrir o Controle de ponto disparava ~20 delas (menu,
 * chips dos colaboradores, meses), e na Vercel cada uma conta como invocação
 * e CPU cobradas. Sem a pré-carga, a tela só é gerada quando alguém clica.
 */
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
