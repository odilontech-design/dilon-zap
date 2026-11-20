import { PaginaDoGrupo, metadataDoGrupo } from "../grupo";

export const dynamic = "force-dynamic";

export const generateMetadata = ({ params }: { params: { slug: string; marca: string } }) => metadataDoGrupo(params.slug, params.marca);

/** Os carros de uma marca em estoque: "Honda usado em Duque de Caxias". */
export default function MarcaPage({ params }: { params: { slug: string; marca: string } }) {
  return <PaginaDoGrupo slug={params.slug} marcaSlug={params.marca} />;
}
