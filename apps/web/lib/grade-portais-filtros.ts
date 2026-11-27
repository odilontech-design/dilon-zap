/**
 * Veículos > Anúncios: tipos da grade e as regras de busca, filtro e ordenação. Puro: roda no navegador e nos testes.
 */

export type AnuncioDaGrade = { ativo: boolean; status: string; url: string | null; erro: string | null; plano: string | null };

export type CarroDaGrade = {
  id: string;
  /** Marca, modelo e anos ("CHEVROLET CLASSIC 2014/2015"). */
  nome: string;
  versao: string | null;
  anoModelo: number;
  placa: string | null;
  status: "DISPONIVEL" | "RESERVADO";
  naVitrine: boolean;
  dias: number;
  precoCents: number;
  /** O preço dos classificados (portais); sem ele, valem os mesmos do site. */
  precoClassificadosCents: number | null;
  km: number;
  semKm: boolean;
  capaId: string | null;
  totalFotos: number;
  /** O endereço do carro na vitrine pública da loja (null = vitrine desligada ou carro fora dela). */
  linkPublico: string | null;
  anuncios: Record<string, AnuncioDaGrade | null>;
};

export type Filtro = "todos" | "faltando" | "erro" | "semKm" | "semFoto" | "parados" | "reservados";
export type Ordem = "maisTempo" | "menosTempo" | "maiorPreco" | "menorPreco" | "nome" | "placa";

export const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "faltando", rotulo: "Faltando em portal" },
  { id: "erro", rotulo: "Com erro" },
  { id: "semKm", rotulo: "Sem km" },
  { id: "semFoto", rotulo: "Sem foto" },
  { id: "parados", rotulo: "Parados +60 dias" },
  { id: "reservados", rotulo: "Reservados" },
];

export const ORDENS: { id: Ordem; rotulo: string }[] = [
  { id: "maisTempo", rotulo: "Mais tempo no pátio" },
  { id: "menosTempo", rotulo: "Menos tempo no pátio" },
  { id: "maiorPreco", rotulo: "Maior preço" },
  { id: "menorPreco", rotulo: "Menor preço" },
  { id: "nome", rotulo: "Marca e modelo" },
  { id: "placa", rotulo: "Placa" },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const limpaPlaca = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Os portais de interesse: um só (escolhido) ou todos os conectados. */
const portaisEmFoco = (portaisConectados: string[], portal: string) => (portal === "todos" ? portaisConectados : portaisConectados.filter((p) => p === portal));

export function passaNoFiltro(c: CarroDaGrade, filtro: Filtro, portaisConectados: string[], portal = "todos"): boolean {
  const foco = portaisEmFoco(portaisConectados, portal);
  switch (filtro) {
    case "faltando":
      return c.status === "DISPONIVEL" && foco.some((p) => !c.anuncios[p]?.ativo);
    case "erro":
      return (portal === "todos" ? Object.keys(c.anuncios) : [portal]).some((p) => c.anuncios[p]?.ativo && c.anuncios[p]?.status === "ERRO");
    case "semKm":
      return c.semKm;
    case "semFoto":
      return c.totalFotos === 0;
    case "parados":
      return c.dias > 60;
    case "reservados":
      return c.status === "RESERVADO";
    default:
      return true;
  }
}

/** Busca por marca, modelo, versão ou placa (sem acento, e a placa com ou sem hífen). */
export function passaNaBusca(c: CarroDaGrade, termo: string): boolean {
  const t = semAcento(termo.trim());
  if (!t) return true;
  const placa = limpaPlaca(c.placa);
  const tPlaca = t.replace(/[^a-z0-9]/g, "");
  return semAcento(`${c.nome} ${c.versao ?? ""}`).includes(t) || (tPlaca.length >= 3 && placa.includes(tPlaca));
}

export function ordenar(carros: CarroDaGrade[], ordem: Ordem): CarroDaGrade[] {
  const l = [...carros];
  const porNome = (a: CarroDaGrade, b: CarroDaGrade) => a.nome.localeCompare(b.nome, "pt-BR");
  switch (ordem) {
    case "menosTempo": return l.sort((a, b) => a.dias - b.dias || porNome(a, b));
    case "maiorPreco": return l.sort((a, b) => b.precoCents - a.precoCents || porNome(a, b));
    case "menorPreco": return l.sort((a, b) => (a.precoCents || Infinity) - (b.precoCents || Infinity) || porNome(a, b));
    case "nome": return l.sort(porNome);
    case "placa": return l.sort((a, b) => (a.placa ?? "ZZZ").localeCompare(b.placa ?? "ZZZ"));
    default: return l.sort((a, b) => b.dias - a.dias || porNome(a, b));
  }
}

export function filtrarEOrdenar(carros: CarroDaGrade[], portaisConectados: string[], o: { termo: string; filtro: Filtro; portal: string; ordem: Ordem }): CarroDaGrade[] {
  return ordenar(carros.filter((c) => passaNaBusca(c, o.termo) && passaNoFiltro(c, o.filtro, portaisConectados, o.portal)), o.ordem);
}

/** Quantos carros cada filtro pega (para mostrar no botão), respeitando a busca e o portal escolhidos. */
export function contagemPorFiltro(carros: CarroDaGrade[], portaisConectados: string[], termo: string, portal: string): Record<Filtro, number> {
  const base = carros.filter((c) => passaNaBusca(c, termo));
  return Object.fromEntries(FILTROS.map((f) => [f.id, base.filter((c) => passaNoFiltro(c, f.id, portaisConectados, portal)).length])) as Record<Filtro, number>;
}

/** A cor do "N dias" do carro no pátio: neutro até 60, âmbar até 90 e vermelho depois (o mesmo corte do painel do estoque). */
export function classeDosDias(dias: number): "normal" | "atencao" | "parado" {
  return dias > 90 ? "parado" : dias > 60 ? "atencao" : "normal";
}

/**
 * O endereço do anúncio no portal, para "Ver anúncio": só o que o portal devolveu. No NaPista o código do anúncio na API
 * NÃO é o da página pública (testado: o endereço montado com ele deu "não encontramos"), então não montamos link por palpite;
 * a conferência de cada anúncio usa o botão "Conferir no NaPista".
 */
export function urlDoAnuncio(_portal: string, pub: { ativo: boolean; status: string; url: string | null; idExterno: string | null }): string | null {
  return pub.ativo && pub.status === "PUBLICADO" && pub.url ? pub.url : null;
}
