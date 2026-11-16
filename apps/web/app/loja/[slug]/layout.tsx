import Script from "next/script";
import { ContadorDeVisitas } from "./contador";
import { headers } from "next/headers";
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
  const ads = loja?.googleAdsId ?? null; // já conferido (AW-números) em lojaPublica
  // O GTM é código livre da loja: só no domínio próprio dela, nunca no endereço do Zap
  // (que é o mesmo do painel, onde a equipe fica logada).
  const host = (headers().get("host") ?? "").split(":")[0].toLowerCase();
  const gtm = loja?.gtmId && loja.dominio && host === loja.dominio.toLowerCase() ? loja.gtmId : null;
  const gtagId = ga ?? ads;
  return (
    <>
      {pixel && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
        </Script>
      )}
      {gtagId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());${[ga, ads].filter(Boolean).map((id) => `gtag('config','${id}');`).join("")}`}
          </Script>
        </>
      )}
      {gtm && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      )}
      {loja && <ContadorDeVisitas slug={loja.slug} />}
      {children}
    </>
  );
}
