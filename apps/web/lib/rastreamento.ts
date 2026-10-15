/**
 * Medição de conversão dos anúncios (Pixel da Meta e Google Ads).
 *
 * Existe porque as duas plataformas otimizavam por clique e por conversa
 * iniciada, sem saber quem de fato se cadastrou — e entregavam curioso
 * barato. Com o evento de cadastro, elas passam a procurar gente parecida
 * com quem se cadastrou.
 *
 * Os IDs vêm do ambiente e são lidos NO SERVIDOR, em tempo de execução: a
 * página /cadastro é dinâmica, então trocar ou ligar a medição é editar o
 * .env e reiniciar o container, sem rebuild (NEXT_PUBLIC_* seria congelado
 * no build). Sem variável, nada é carregado — instalação white-label não
 * manda dado de visitante pra conta de anúncio de ninguém.
 *
 * Só a /cadastro carrega isto, de propósito: é página pública de aquisição.
 * A área logada não recebe script de terceiro.
 */

export type ConfigRastreamento = {
  metaPixelId: string | null;
  /** "AW-123456789" */
  googleAdsId: string | null;
  /** Rótulo da ação de conversão "Cadastro" no Google Ads. */
  googleAdsRotuloCadastro: string | null;
};

const limpo = (v: string | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

export function configRastreamento(): ConfigRastreamento {
  const pixel = limpo(process.env.META_PIXEL_ID);
  const google = limpo(process.env.GOOGLE_ADS_ID);
  const rotulo = limpo(process.env.GOOGLE_ADS_ROTULO_CADASTRO);
  return {
    // Validação mínima: um ID com lixo viraria script quebrado na página que
    // mais importa vender. Pixel é só dígitos; Google Ads é AW-dígitos.
    metaPixelId: pixel && /^\d{10,20}$/.test(pixel) ? pixel : null,
    googleAdsId: google && /^AW-\d{6,15}$/.test(google) ? google : null,
    // O rótulo também vai pro script do navegador: só letras, dígitos, - e _.
    googleAdsRotuloCadastro: rotulo && /^[\w-]{4,40}$/.test(rotulo) ? rotulo : null,
  };
}

type JanelaComTags = Window & {
  fbq?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
};

/**
 * Dispara o evento de cadastro concluído. Chamado só depois que a rota
 * confirmou o pedido — clique no botão com erro de validação não conta.
 * Nunca lança: medição falhar não pode atrapalhar quem acabou de se cadastrar.
 */
export function registrarCadastro(cfg: ConfigRastreamento | undefined) {
  if (!cfg || typeof window === "undefined") return;
  const w = window as JanelaComTags;
  try {
    if (cfg.metaPixelId && w.fbq) w.fbq("track", "Lead");
    if (cfg.googleAdsId && cfg.googleAdsRotuloCadastro && w.gtag) {
      w.gtag("event", "conversion", { send_to: `${cfg.googleAdsId}/${cfg.googleAdsRotuloCadastro}` });
    }
  } catch {
    /* best-effort */
  }
}
