/**
 * Listas e regras do cadastro do carro no jeito do AutoCerto (que é o que a equipe das lojas
 * conhece): características em etiquetas, opcionais em caixas de marcar, carroceria, vídeo e a
 * "qualidade do anúncio". Sem imports de servidor: a tela usa este arquivo.
 */

export const CARACTERISTICAS = [
  "7 lugares",
  "Adaptado para PcD",
  "Blindado",
  "Chave reserva",
  "Garantia de fábrica",
  "IPVA pago",
  "Licenciado",
  "Manual do proprietário",
  "Passagem por leilão",
  "Revisado em concessionária",
  "Único dono",
] as const;

export const OPCIONAIS = [
  "Acendimento automático dos faróis", "Airbag de cortina", "Airbags laterais", "Airbag motorista", "Airbag passageiro", "Alarme",
  "Alerta de ponto cego", "Android Auto", "Apple CarPlay", "Ar-condicionado", "Ar-condicionado digital", "Ar-condicionado dual zone",
  "Ar quente", "Assistente de partida em rampa", "Assistente de permanência em faixa", "Auto Hold", "Banco do motorista com ajuste de altura",
  "Banco do motorista com ajuste elétrico", "Banco traseiro bipartido", "Bancos de couro", "Bancos dianteiros com aquecimento", "Bancos elétricos",
  "Bluetooth", "Câmera 360", "Câmera de ré", "Capota marítima", "Carregador por indução", "CD player", "CD player com MP3", "Chave presencial",
  "Computador de bordo", "Controle de descida (HDC)", "Controle de estabilidade", "Controle de som no volante", "Controle de tração",
  "Controle de velocidade", "Desembaçador traseiro", "Direção elétrica", "Direção hidráulica", "DVD player", "Encosto de cabeça traseiro",
  "Engate", "Entrada USB", "Faróis de xenon", "Farol de LED", "Farol de milha", "Farol de neblina", "Freio de mão elétrico", "Freios ABS",
  "GPS", "Insulfilm", "ISOFIX", "Limitador de velocidade", "Limpador traseiro", "Luz de condução diurna (DRL)", "Multimídia",
  "Para-choques na cor do veículo", "Park Assist", "Piloto automático", "Porta-copos", "Porta-malas elétrico", "Protetor de caçamba",
  "Rack de teto", "Retrovisor fotocrômico", "Retrovisores elétricos", "Rodas de liga leve", "Sensor de chuva", "Sensor de estacionamento",
  "Start-Stop", "Teto panorâmico", "Teto solar", "Tração 4x4", "Travas elétricas", "Vidros elétricos", "Vidros elétricos traseiros",
  "Volante com regulagem de altura",
] as const;

export const CARROCERIAS = ["Hatch", "Sedã", "SUV", "Picape", "Minivan", "Perua/SW", "Cupê", "Conversível", "Utilitário", "Van"] as const;

/** O id do vídeo do YouTube (watch?v=, youtu.be/, shorts/, embed/), ou nulo. */
export function idDoYoutube(url: string | null | undefined): string | null {
  const t = (url ?? "").trim();
  if (!t) return null;
  const m = t.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** O que conta para a qualidade do anúncio, com o peso de cada item (soma 100). */
const ITENS_QUALIDADE: { chave: string; rotulo: string; peso: number }[] = [
  { chave: "fotos", rotulo: "8 fotos ou mais", peso: 25 },
  { chave: "preco", rotulo: "Preço", peso: 15 },
  { chave: "km", rotulo: "Quilometragem", peso: 10 },
  { chave: "versao", rotulo: "Versão", peso: 10 },
  { chave: "detalhes", rotulo: "Cor, câmbio e combustível", peso: 10 },
  { chave: "opcionais", rotulo: "5 opcionais ou mais", peso: 10 },
  { chave: "observacao", rotulo: "Observação do anúncio", peso: 10 },
  { chave: "caracteristicas", rotulo: "Características", peso: 5 },
  { chave: "placa", rotulo: "Placa (os portais usam para conferir o carro)", peso: 5 },
];

export type DadosParaQualidade = {
  fotos: number;
  precoCents: number | null;
  km: string | number | null;
  zeroKm?: boolean;
  versao: string | null;
  cor: string | null;
  cambio: string | null;
  combustivel: string | null;
  opcionais: number;
  descricao: string | null;
  caracteristicas: number;
  placa: string | null;
};

/** A nota do anúncio (0 a 100) e o que falta, no mesmo espírito da "Qualidade do anúncio" do AutoCerto. */
export function qualidadeDoAnuncio(d: DadosParaQualidade): { nota: number; falta: string[] } {
  const ok: Record<string, boolean> = {
    fotos: d.fotos >= 8,
    preco: (d.precoCents ?? 0) > 0,
    km: !!d.zeroKm || (d.km !== null && d.km !== "" && Number(String(d.km).replace(/\D/g, "")) > 0),
    versao: !!d.versao?.trim(),
    detalhes: !!(d.cor?.trim() && d.cambio?.trim() && d.combustivel?.trim()),
    opcionais: d.opcionais >= 5,
    observacao: (d.descricao?.trim().length ?? 0) >= 40,
    caracteristicas: d.caracteristicas > 0,
    placa: !!d.placa?.trim(),
  };
  const nota = ITENS_QUALIDADE.reduce((s, i) => s + (ok[i.chave] ? i.peso : 0), 0);
  return { nota, falta: ITENS_QUALIDADE.filter((i) => !ok[i.chave]).map((i) => i.rotulo) };
}
