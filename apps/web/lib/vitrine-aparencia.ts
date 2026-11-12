/**
 * Aparência e páginas da vitrine pública: cor, redes sociais, mapa, caminhos e o
 * texto padrão da política de privacidade. Puro (sem banco nem rede), para
 * testar cada regra. O que a loja digita vira endereço ou cor na página
 * pública, então tudo é validado e remontado aqui, nunca repassado como veio.
 */

const HEX = /^#[0-9a-f]{6}$/i;

export const COR_PADRAO = "#1f6f4a";

/** "#1F6F4A" → "#1f6f4a"; qualquer outra coisa → null. */
export function corValida(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  return HEX.test(v) ? v.toLowerCase() : null;
}

/** Luminância relativa (WCAG) de #rrggbb, de 0 a 1. */
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

/** Texto branco ou escuro, o que contrastar melhor sobre a cor da loja. */
export function corDoTexto(fundo: string): "#ffffff" | "#111827" {
  const L = luminancia(fundo);
  const comBranco = 1.05 / (L + 0.05);
  const comEscuro = (L + 0.05) / (luminancia("#111827") + 0.05);
  return comBranco >= comEscuro ? "#ffffff" : "#111827";
}

/** "@salesautomoveis", "instagram.com/sales" ou a URL inteira → https://www.instagram.com/<usuario>/. Inválido → null. */
export function linkInstagram(valor: string | null | undefined): string | null {
  const t = (valor ?? "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(t) ? `https://www.instagram.com/${t}/` : null;
}

/** Página do Facebook: usuário/nome da página ou a URL (inclusive "profile.php?id="). Inválido → null. */
export function linkFacebook(valor: string | null | undefined): string | null {
  let t = (valor ?? "").trim();
  if (!t) return null;
  t = t.replace(/^https?:\/\/(www\.|m\.|pt-br\.)?facebook\.com\//i, "").replace(/^facebook\.com\//i, "").replace(/^@/, "");
  const id = t.match(/^profile\.php\?id=(\d{5,20})$/);
  if (id) return `https://www.facebook.com/profile.php?id=${id[1]}`;
  const pagina = t.replace(/[?#].*$/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9.\-]{3,80}(\/[A-Za-z0-9.\-]{1,80}){0,2}$/.test(pagina) ? `https://www.facebook.com/${pagina}` : null;
}

/** Mapa embutido (sem chave de API) e o link para abrir o endereço no Google Maps. */
export function mapaDoEndereco(endereco: string | null | undefined): { embed: string; abrir: string } | null {
  const e = (endereco ?? "").replace(/\s+/g, " ").trim();
  if (e.length < 6) return null;
  const q = encodeURIComponent(e);
  return { embed: `https://www.google.com/maps?q=${q}&output=embed`, abrir: `https://www.google.com/maps/search/?api=1&query=${q}` };
}

/** Horário em linhas: "Seg a Sex 8h às 18h\nSáb 8h às 12h". */
export function horarioEmLinhas(texto: string | null | undefined): string[] {
  return (texto ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8);
}

export const PAGINAS = ["venda-seu-carro", "financiamento", "localizacao", "privacidade"] as const;
export type PaginaDaLoja = (typeof PAGINAS)[number];

/**
 * O caminho de uma página da loja: no domínio próprio é curto (/financiamento,
 * que o middleware reescreve); no endereço do Zap é /loja/<slug>/financiamento.
 * Sem página, é a vitrine.
 */
export function caminhoDaLoja(slug: string, dominio?: string | null, pagina?: PaginaDaLoja): string {
  if (dominio) return pagina ? `/${pagina}` : "/";
  return pagina ? `/loja/${slug}/${pagina}` : `/loja/${slug}`;
}

export type DadosDaPolitica = { nome: string; endereco: string | null; whatsapp: string | null; usaPixel: boolean; usaAnalytics: boolean };

/**
 * Política de privacidade padrão (LGPD) da vitrine: o que o site coleta de
 * verdade (os formulários e, se a loja ligou, pixel e analytics), para que
 * serve e como pedir para apagar. É um modelo: a loja pode trocar pelo texto
 * do advogado dela na configuração da vitrine.
 */
export function politicaPadrao(d: DadosDaPolitica): { titulo: string; texto: string }[] {
  const contato = [d.whatsapp ? `WhatsApp ${d.whatsapp.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3")}` : null, d.endereco].filter(Boolean).join(" · ");
  const terceiros = [d.usaPixel && "o Pixel da Meta (Facebook e Instagram)", d.usaAnalytics && "o Google Analytics"].filter(Boolean) as string[];
  return [
    { titulo: "Quem somos", texto: `Este site é da ${d.nome}${d.endereco ? `, ${d.endereco}` : ""}. A ${d.nome} é a responsável (controladora) pelos dados pessoais tratados aqui, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018).` },
    { titulo: "Quais dados coletamos", texto: "Só o que você digita nos formulários do site: nome, telefone (WhatsApp), e-mail quando pedido, e as informações que você escolhe enviar, como o carro que quer comprar, o carro que quer vender (marca, modelo, ano e quilometragem), o valor de entrada e a mensagem. Não pedimos CPF, dados de cartão nem senhas." },
    { titulo: "Para que usamos", texto: "Para responder ao seu contato, apresentar o veículo de seu interesse, avaliar o seu carro, simular financiamento e dar continuidade à negociação. Também para registrar o atendimento e cumprir obrigações legais. Não vendemos seus dados." },
    { titulo: "Com quem compartilhamos", texto: `Seus dados ficam num sistema de gestão de atendimento contratado pela loja e, quando você pede financiamento, podem ser enviados às instituições financeiras para a simulação${terceiros.length ? `. O site também usa ${terceiros.join(" e ")}, que coletam dados de navegação (páginas visitadas, tipo de aparelho) para medir visitas e mostrar anúncios` : ""}.` },
    { titulo: "Por quanto tempo guardamos", texto: "Pelo tempo necessário para o atendimento e para cumprir obrigações legais e contratuais. Depois disso, apagamos ou tornamos anônimos." },
    { titulo: "Seus direitos", texto: `Você pode pedir a confirmação de que tratamos seus dados, acesso, correção, anonimização, portabilidade, informação sobre compartilhamento e a eliminação dos dados, e retirar o consentimento a qualquer momento (art. 18 da LGPD). Para isso, fale com a gente${contato ? `: ${contato}` : ""}.` },
    { titulo: "Cookies", texto: terceiros.length ? `Este site usa cookies de ${terceiros.join(" e ")} para medir o uso e a eficácia dos anúncios. Você pode bloquear cookies nas configurações do navegador.` : "Este site não usa cookies de rastreamento ou publicidade." },
    { titulo: "Atualizações", texto: "Podemos atualizar esta política. A versão em vigor é sempre a publicada nesta página." },
  ];
}
