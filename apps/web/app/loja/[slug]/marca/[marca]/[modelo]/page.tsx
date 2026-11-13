import { PaginaDoGrupo, metadataDoGrupo } from "../../grupo";

export const dynamic = "force-dynamic";

export const generateMetadata = ({ params }: { params: { slug: string; marca: string; modelo: string } }) => metadataDoGrupo(params.slug, params.marca, params.modelo);

/** Os carros de um modelo em estoque: "Honda Civic usado em Duque de Caxias". */
export default function ModeloPage({ params }: { params: { slug: string; marca: string; modelo: string } }) {
  return <PaginaDoGrupo slug={params.slug} marcaSlug={params.marca} modeloSlug={params.modelo} />;
}
