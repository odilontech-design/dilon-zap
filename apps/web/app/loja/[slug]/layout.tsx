import Script from "next/script";
import { lojaPublica } from "@/lib/vitrine";

/**
 * Pixel do Facebook/Instagram e Google Analytics da loja, só na vitrine dela
 * e só se a loja cadastrou. Com eles a loja mede as visitas e cria público
 * para anunciar (quem viu um carro e não chamou).
 */
export default async function LayoutDaLoja({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  // Só dígitos (Meta) e o formato G-XXXX (GA4): o valor vai para dentro de um script.
  const pixel = loja?.metaPixelId && /^\d{5,20}$/.test(loja.metaPixelId) ? loja.metaPixelId : null;
  const ga = loja?.ga4Id && /^G-[A-Z0-9]{4,15}$/.test(loja.ga4Id) ? loja.ga4Id : null;
  return (
    <>
      {pixel && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
        </Script>
      )}
      {ga && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      )}
      {children}
    </>
  );
}
