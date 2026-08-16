import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dilon Zap",
  description: "Atendimento via WhatsApp — Dilon Tech",
};

// Roda antes da primeira pintura, ainda no <head>, porque a preferência mora
// no localStorage — que só existe no navegador. Sem isso a página carregaria
// clara e viraria escura depois da hidratação: um flash branco na cara de
// quem escolheu modo noite, toda vez que abre o sistema.
//
// Precisa espelhar `aplicarTema` do theme-toggle. São duas cópias da mesma
// regra por necessidade (uma roda sem React), então mudar uma sem a outra
// volta o flash.
const SCRIPT_TEMA = `
try {
  var t = localStorage.getItem('dilonzap:tema');
  document.documentElement.dataset.theme = t === 'escuro' ? 'dark' : 'light';
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: o script acima mexe no data-theme do <html>
    // antes do React hidratar, então o atributo legitimamente difere do que
    // veio do servidor.
    <html lang="pt-BR" suppressHydrationWarning>
      {/* O script fica como primeiro filho do <body>, e não num <head>
          declarado à mão: no App Router o <head> é montado pelo Next, e
          declarar um concorrente atrapalha a hidratação — o efeito colateral
          é a página carregar mas os botões não responderem. Aqui ele roda
          antes do conteúdo do body ser lido, que é o que importa pro flash. */}
      <body>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        {children}
      </body>
    </html>
  );
}
