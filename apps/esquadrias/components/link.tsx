import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * Link sem pré-carregamento.
 *
 * O <Link> do Next pré-carrega toda tela cujo link aparece na página. Aqui
 * as telas são dinâmicas (dados da empresa logada), então cada pré-carga é
 * uma execução no servidor: abrir uma tela disparava de 10 a 17 delas (o menu
 * lateral inteiro, as linhas da lista), e na Vercel cada uma conta como
 * invocação e CPU cobradas. Sem a pré-carga, a tela só é gerada quando alguém
 * clica. Mesmo componente de apps/ponto/components/link.tsx.
 */
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
