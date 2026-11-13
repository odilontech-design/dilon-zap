/**
 * A foto inteira, sem cortar. Revendas costumam usar como capa uma arte quadrada
 * (marca, ano, versão e telefone escritos na imagem): cortar para 4:3 corta esse
 * texto. Aqui a foto fica inteira (object-contain) sobre uma cópia dela mesma
 * desfocada, que preenche as laterais sem faixas brancas. Serve a foto de carro
 * em qualquer proporção. O pai precisa ser `relative overflow-hidden` com tamanho.
 */
export function FotoSemCortes({ src, fundo, srcSet, sizes, alt, loading = "lazy", prioridade = false, className = "" }: { src: string; /** Versão leve usada só para o desfoque (padrão: a própria foto). */ fundo?: string; srcSet?: string; sizes?: string; alt: string; loading?: "lazy" | "eager"; prioridade?: boolean; className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fundo ?? src} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} srcSet={srcSet} sizes={sizes} alt={alt} loading={loading} decoding="async" fetchPriority={prioridade ? "high" : undefined} className={`absolute inset-0 h-full w-full object-contain text-transparent ${className}`} />
    </>
  );
}
