import { prisma } from "@dilon-zap/db";

/**
 * Meu site > Dados da loja, WhatsApp e Avançado (no jeito do AutoCerto).
 *
 * O endereço e o horário são guardados em partes, mas também montados nos campos antigos
 * ("endereco" e "horario"), que é o que o site, o SEO e os feeds já leem. Como no AutoCerto,
 * o CEP e o 1º telefone também vão para os anúncios dos portais.
 */

export const TIPOS_DE_TELEFONE = ["WHATSAPP", "CELULAR", "FIXO"] as const;
export type TipoDeTelefone = (typeof TIPOS_DE_TELEFONE)[number];
export type Telefone = { tipo: TipoDeTelefone; numero: string };
export const MAX_TELEFONES = 3;
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

/** Igual ao de lib/vitrine.ts (copiado para não criar import circular). */
function normalizarWhatsapp(numero: string | null | undefined): string | null {
  const d = (numero ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const limpo = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;

/** Os telefones guardados, só os válidos (lixo no JSON não quebra o site). */
export function telefonesDaLoja(json: unknown): Telefone[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((t): t is Telefone => !!t && typeof t === "object" && TIPOS_DE_TELEFONE.includes((t as Telefone).tipo) && typeof (t as Telefone).numero === "string" && /^55\d{10,11}$/.test((t as Telefone).numero))
    .slice(0, MAX_TELEFONES);
}

/** "(21) 96762-9631" a partir de "5521967629631". */
export function formatarTelefone(numero: string): string {
  return numero.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
}

export function montarEndereco(d: { logradouro?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null }): string | null {
  const cidade = [d.cidade?.trim(), d.uf?.trim()].filter(Boolean).join("/");
  return [d.logradouro?.trim(), d.bairro?.trim(), cidade].filter(Boolean).join(" · ") || null;
}

/** As linhas do horário. Faixa em branco aparece como "Fechado" (só se alguma outra estiver preenchida). */
export function montarHorario(d: { semana?: string | null; sabado?: string | null; domingo?: string | null }): string | null {
  if (!d.semana?.trim() && !d.sabado?.trim() && !d.domingo?.trim()) return null;
  return [`Segunda a sexta: ${d.semana?.trim() || "Fechado"}`, `Sábado: ${d.sabado?.trim() || "Fechado"}`, `Domingo: ${d.domingo?.trim() || "Fechado"}`].join("\n");
}

/** O ponto do mapa a partir de "-22.79, -43.29" ou de um link do Google Maps (@lat,lng, q=lat,lng ou !3dlat!4dlng). */
export function lerPontoDoMapa(entrada: string | null | undefined): { lat: number; lng: number } | null {
  const t = decodeURIComponent((entrada ?? "").trim());
  if (!t) return null;
  const n = String.raw`(-?\d{1,2}\.\d+)`;
  const m =
    t.match(new RegExp(String.raw`!3d${n}!4d(-?\d{1,3}\.\d+)`)) ??
    t.match(new RegExp(String.raw`@${n},(-?\d{1,3}\.\d+)`)) ??
    t.match(new RegExp(String.raw`[?&](?:q|query|ll)=${n},\s*(-?\d{1,3}\.\d+)`)) ??
    t.match(new RegExp(String.raw`^${n}\s*,\s*(-?\d{1,3}\.\d+)$`));
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** O mapa do site: pelo ponto, se a loja marcou; senão, pelo endereço. Nulo se a loja desligou o mapa. */
export function mapaDaLoja(d: { mapaAtivo: boolean; mapaLat: number | null; mapaLng: number | null; endereco: string | null }): { embed: string; abrir: string } | null {
  if (!d.mapaAtivo) return null;
  if (d.mapaLat != null && d.mapaLng != null) {
    const q = `${d.mapaLat},${d.mapaLng}`;
    return { embed: `https://www.google.com/maps?q=${q}&z=17&output=embed`, abrir: `https://www.google.com/maps/search/?api=1&query=${q}` };
  }
  const e = (d.endereco ?? "").replace(/\s+/g, " ").trim();
  if (e.length < 6) return null;
  const q = encodeURIComponent(e);
  return { embed: `https://www.google.com/maps?q=${q}&output=embed`, abrir: `https://www.google.com/maps/search/?api=1&query=${q}` };
}

/** A mensagem pronta do botão do WhatsApp: a da loja, ou o padrão com o nome do site. */
export function mensagemDoWhatsapp(mensagem: string | null | undefined, nomeDaLoja: string): string {
  return mensagem?.trim() || `Olá! Vim pelo site ${nomeDaLoja} e quero mais informações.`;
}

// ---- telas ----

export type EntradaDadosDaLoja = {
  cep?: string | null;
  logradouro?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  telefones?: { tipo: string; numero: string }[];
  mapaAtivo?: boolean;
  ponto?: string | null;
  horarioSemana?: string | null;
  horarioSabado?: string | null;
  horarioDomingo?: string | null;
};

export async function salvarDadosDaLoja(tenantId: string, d: EntradaDadosDaLoja): Promise<{ ok: true } | { ok: false; erro: string }> {
  const cep = soDigitos(d.cep) || null;
  if (cep && cep.length !== 8) return { ok: false, erro: "CEP precisa ter 8 dígitos" };
  const uf = d.uf?.trim().toUpperCase() || null;
  if (uf && !UFS.includes(uf)) return { ok: false, erro: "estado inválido" };
  const telefones: Telefone[] = [];
  for (const t of (d.telefones ?? []).filter((t) => soDigitos(t.numero))) {
    const digitos = soDigitos(t.numero).replace(/^55(?=\d{10,11}$)/, "");
    if (digitos.length !== 10 && digitos.length !== 11) return { ok: false, erro: `telefone ${t.numero}: use DDD + número` };
    if (!TIPOS_DE_TELEFONE.includes(t.tipo as TipoDeTelefone)) return { ok: false, erro: "tipo de telefone inválido" };
    telefones.push({ tipo: t.tipo as TipoDeTelefone, numero: `55${digitos}` });
  }
  if (telefones.length > MAX_TELEFONES) return { ok: false, erro: `no máximo ${MAX_TELEFONES} telefones` };
  let ponto: { lat: number; lng: number } | null = null;
  if (d.ponto?.trim()) {
    ponto = lerPontoDoMapa(d.ponto);
    if (!ponto) return { ok: false, erro: "ponto do mapa inválido: cole o link do Google Maps ou as coordenadas (ex.: -22.79373, -43.29856)" };
  }
  const partes = { logradouro: limpo(d.logradouro, 160), bairro: limpo(d.bairro, 80), cidade: limpo(d.cidade, 80), uf };
  const horario = { semana: limpo(d.horarioSemana, 60), sabado: limpo(d.horarioSabado, 60), domingo: limpo(d.horarioDomingo, 60) };
  const data = {
    cep,
    ...partes,
    telefones,
    mapaAtivo: d.mapaAtivo ?? true,
    mapaLat: ponto?.lat ?? null,
    mapaLng: ponto?.lng ?? null,
    horarioSemana: horario.semana,
    horarioSabado: horario.sabado,
    horarioDomingo: horario.domingo,
    endereco: montarEndereco(partes),
    horario: montarHorario(horario),
    // Como no AutoCerto: o CEP e o 1º telefone também vão nos anúncios dos portais.
    ...(cep ? { cepAnuncios: cep } : {}),
    ...(telefones[0] ? { telefoneAnuncios: telefones[0].numero.slice(2) } : {}),
  };
  await prisma.veiculosConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  return { ok: true };
}

export async function salvarWhatsappDoSite(tenantId: string, d: { numero?: string | null; mensagem?: string | null }): Promise<{ ok: true } | { ok: false; erro: string }> {
  const whatsapp = normalizarWhatsapp(d.numero);
  if (d.numero?.trim() && (!whatsapp || !/^55\d{10,11}$/.test(whatsapp))) return { ok: false, erro: "WhatsApp inválido: use DDD + número" };
  const data = { whatsapp, whatsappMensagem: limpo(d.mensagem, 300) };
  await prisma.veiculosConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  return { ok: true };
}

export const FORMATOS_AVANCADO = {
  metaPixelId: { re: /^\d{5,20}$/, erro: "o ID do Pixel da Meta tem só números" },
  ga4Id: { re: /^G-[A-Z0-9]{4,15}$/, erro: "o ID do Google Analytics começa com G-" },
  googleAdsId: { re: /^AW-\d{6,15}$/, erro: "o ID do Google Ads começa com AW- seguido de números" },
  gtmId: { re: /^GTM-[A-Z0-9]{4,12}$/, erro: "o ID do Google Tag Manager começa com GTM-" },
} as const;

/** Só IDs no formato de cada serviço: o valor vai para dentro de um script do site. */
export function idDeMedicao(campo: keyof typeof FORMATOS_AVANCADO, valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim().toUpperCase();
  return v && FORMATOS_AVANCADO[campo].re.test(v) ? v : null;
}

export async function salvarAvancado(tenantId: string, d: Partial<Record<keyof typeof FORMATOS_AVANCADO, string | null>>): Promise<{ ok: true } | { ok: false; erro: string }> {
  const data: Partial<Record<keyof typeof FORMATOS_AVANCADO, string | null>> = {};
  for (const campo of Object.keys(FORMATOS_AVANCADO) as (keyof typeof FORMATOS_AVANCADO)[]) {
    if (d[campo] === undefined) continue;
    const bruto = d[campo]?.trim();
    if (!bruto) data[campo] = null;
    else {
      const id = idDeMedicao(campo, bruto);
      if (!id) return { ok: false, erro: FORMATOS_AVANCADO[campo].erro };
      data[campo] = id;
    }
  }
  await prisma.veiculosConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  return { ok: true };
}

/** O que as abas Dados da loja, WhatsApp e Avançado mostram. */
export async function dadosDaLoja(tenantId: string) {
  const c = await prisma.veiculosConfig.findUnique({ where: { tenantId } });
  return {
    cep: c?.cep ?? c?.cepAnuncios ?? "",
    logradouro: c?.logradouro ?? (c?.cidade ? "" : c?.endereco ?? ""),
    bairro: c?.bairro ?? "",
    cidade: c?.cidade ?? "",
    uf: c?.uf ?? "",
    telefones: telefonesDaLoja(c?.telefones).map((t) => ({ tipo: t.tipo, numero: formatarTelefone(t.numero) })),
    mapaAtivo: c?.mapaAtivo ?? true,
    ponto: c?.mapaLat != null && c?.mapaLng != null ? `${c.mapaLat}, ${c.mapaLng}` : "",
    horarioSemana: c?.horarioSemana ?? "",
    horarioSabado: c?.horarioSabado ?? "",
    horarioDomingo: c?.horarioDomingo ?? "",
    horarioAntigo: c?.horarioSemana || c?.horarioSabado || c?.horarioDomingo ? "" : c?.horario ?? "",
    whatsapp: c?.whatsapp ? formatarTelefone(c.whatsapp) : "",
    whatsappMensagem: c?.whatsappMensagem ?? "",
    metaPixelId: c?.metaPixelId ?? "",
    ga4Id: c?.ga4Id ?? "",
    googleAdsId: c?.googleAdsId ?? "",
    gtmId: c?.gtmId ?? "",
    dominio: c?.dominio ?? null,
  };
}
