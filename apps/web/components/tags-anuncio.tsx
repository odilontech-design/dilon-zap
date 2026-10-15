import Script from "next/script";
import type { ConfigRastreamento } from "@/lib/rastreamento";

/**
 * Carrega o Pixel da Meta e o gtag do Google Ads com os IDs configurados.
 * Ver lib/rastreamento.ts. Sem ID, não renderiza nada.
 *
 * Os IDs já passaram pela validação de formato em configRastreamento, então
 * entrar no script como texto não abre brecha de injeção.
 */
export function TagsAnuncio({ cfg }: { cfg: ConfigRastreamento }) {
  return (
    <>
      {cfg.metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${cfg.metaPixelId}');fbq('track','PageView');`}
        </Script>
      )}
      {cfg.googleAdsId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${cfg.googleAdsId}`} strategy="afterInteractive" />
          <Script id="google-ads" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${cfg.googleAdsId}');`}
          </Script>
        </>
      )}
    </>
  );
}
