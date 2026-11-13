import { ErroSoap, campos, chamarSoap, comoLista } from "./soap";

/**
 * Cliente da integração de revendedor da Webmotors (serviços SOAP). Fonte:
 * https://integracao.webmotors.com.br/manualintegracao/index.html e os WSDL públicos.
 * Os endereços podem ser trocados por WEBMOTORS_URL_BASE (homologação ou servidor falso de teste).
 */

const NS_LOGIN = "www.webmotors.com.br/wsLoginSistemaRevendedor";
const NS_ESTOQUE = "www.webmotors.com.br/wsEstoqueRevendedorWebMotors";

/** Produção. Homologação: https://hportal.webmotors.com.br/IntegracaoRevendedor */
const BASE_PADRAO = "https://integracao.webmotors.com.br";
const base = () => (process.env.WEBMOTORS_URL_BASE ?? BASE_PADRAO).replace(/\/$/, "");

export type CredenciaisWebmotors = { cnpj: string; email: string; senha: string };

/** O código de retorno que a Webmotors dá a cada objeto: 500 é sucesso. */
export const RETORNO_OK = "500";
const MENSAGENS: Record<string, string> = {
  "400": "Falha inesperada na Webmotors",
  "401": "Hash de autenticação inválido",
  "402": "Sessão expirou",
  "403": "O usuário de integração não tem permissão para esta operação (confira o pacote API Site e as permissões no Cockpit)",
};
export const mensagemDeRetorno = (codigo: string | undefined) => MENSAGENS[codigo ?? ""] ?? `Webmotors respondeu o código ${codigo ?? "desconhecido"}`;

export class ErroWebmotors extends Error {
  constructor(message: string, readonly codigo?: string) {
    super(message);
  }
  /** Sessão vencida ou hash inválido: vale autenticar de novo e repetir. */
  get sessaoExpirada() {
    return this.codigo === "401" || this.codigo === "402";
  }
  /** Sem permissão: repetir não adianta, a loja precisa corrigir no Cockpit. */
  get semPermissao() {
    return this.codigo === "403";
  }
}

const texto = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Dados do anúncio, no esquema `Anuncio` do serviço (a ordem importa). */
export type AnuncioWM = {
  CodigoAnuncio: number;
  CodigoModalidade: number;
  TipoAnuncio: "U" | "N";
  CodigoMarca: number;
  CodigoModelo: number;
  CodigoVersao: number;
  AnoDoModelo: number;
  AnoFabricacao: number;
  Km: number;
  Placa?: string;
  CodigoCambio: string;
  NrPortas: number;
  CodigoCor: string;
  CodigoCombustivel: string;
  Blindado?: "S" | "N";
  UnicoDono?: "S" | "N";
  Alienado?: "S" | "N";
  IpvaPago?: "S" | "N";
  NaoAceitaTroca?: "S" | "N";
  Licenciado?: "S" | "N";
  Leilao?: "S" | "N";
  GarantiaDeFabrica?: "S" | "N";
  PrecoReal: number;
  PrecoVenda: number;
  Observacao?: string;
  /** Códigos de opcional do catálogo da Webmotors. */
  Opcionais?: number[];
};

const dec = (n: number) => n.toFixed(2);

export function anuncioXml(a: AnuncioWM): string {
  const opcionais = a.Opcionais?.length ? `<Opcional>${a.Opcionais.map((c) => `<OpcionalWM>${campos([["CodigoOpcional", c]])}</OpcionalWM>`).join("")}</Opcional>` : "";
  return (
    campos([
      ["CodigoAnuncio", a.CodigoAnuncio],
      ["CodigoModalidade", a.CodigoModalidade],
      ["TipoAnuncio", a.TipoAnuncio],
      ["CodigoMarca", a.CodigoMarca],
      ["CodigoModelo", a.CodigoModelo],
      ["CodigoVersao", a.CodigoVersao],
      ["AnoDoModelo", a.AnoDoModelo],
      ["AnoFabricacao", a.AnoFabricacao],
      ["Km", a.Km],
      ["Placa", a.Placa],
      ["CodigoCambio", a.CodigoCambio],
      ["NrPortas", a.NrPortas],
      ["CodigoCor", a.CodigoCor],
      ["CodigoCombustivel", a.CodigoCombustivel],
      ["Blindado", a.Blindado],
      ["UnicoDono", a.UnicoDono],
      ["Alienado", a.Alienado],
      ["IpvaPago", a.IpvaPago],
      ["NaoAceitaTroca", a.NaoAceitaTroca],
      ["GarantiaDeFabrica", a.GarantiaDeFabrica],
      ["Licenciado", a.Licenciado],
      ["Leilao", a.Leilao],
      ["PrecoReal", dec(a.PrecoReal)],
      ["PrecoVenda", dec(a.PrecoVenda)],
      ["Observacao", a.Observacao],
    ]) + opcionais
  );
}

/** Um anúncio que já existe na Webmotors. */
export type AnuncioExistente = { codigo: string; placa: string; modalidade: string; km: number; preco: number };

export type ItemCatalogo = { codigo: string; nome: string };
export type Modalidade = { codigo: string; descricao: string; tipo: string; total: number; usados: number };

/**
 * Uma sessão com a Webmotors. Autentica sozinha na primeira chamada e de novo quando o hash
 * vence (a sessão dura 1000 minutos). Cada método confere o código de retorno do objeto.
 */
export class SessaoWebmotors {
  private hash: string | null = null;
  constructor(private readonly cred: CredenciaisWebmotors) {}

  async autenticar(): Promise<string> {
    const r = (await chamarSoap({
      url: `${base()}/wsLoginSistemaRevendedor.asmx`,
      ns: NS_LOGIN,
      operacao: "autenticar",
      corpo: campos([["cnpj", this.cred.cnpj.replace(/\D/g, "")], ["email", this.cred.email], ["senha", this.cred.senha]]),
    })) as { HashAutenticacao?: string; CodigoRetorno?: string } | null;
    const codigo = texto(r?.CodigoRetorno);
    if (!r?.HashAutenticacao || (codigo && codigo !== RETORNO_OK)) {
      throw new ErroWebmotors(codigo === "403" || !codigo ? "A Webmotors não aceitou o CNPJ, o e-mail ou a senha do usuário de integração" : mensagemDeRetorno(codigo), codigo || "403");
    }
    this.hash = r.HashAutenticacao;
    return this.hash;
  }

  /** Chama uma operação do serviço de estoque, reautenticando uma vez se a sessão venceu. */
  private async estoque<T = any>(operacao: string, resto: string): Promise<T> {
    for (let tentativa = 0; ; tentativa++) {
      const hash = this.hash ?? (await this.autenticar());
      const r = (await chamarSoap({ url: `${base()}/wsEstoqueRevendedorWebMotors.asmx`, ns: NS_ESTOQUE, operacao, corpo: campos([["pHashAutenticacao", hash]]) + resto })) as any;
      // Objeto único ou lista: o código de retorno é o do primeiro item.
      const primeiro = r && typeof r === "object" ? (Object.values(r as object).find((v) => v && typeof v === "object") as any) : null;
      const codigo = texto(r?.CodigoRetorno ?? (Array.isArray(primeiro) ? primeiro[0]?.CodigoRetorno : primeiro?.CodigoRetorno));
      if (/^\d{3}$/.test(codigo) && codigo !== RETORNO_OK) {
        const erro = new ErroWebmotors(mensagemDeRetorno(codigo), codigo);
        if (erro.sessaoExpirada && tentativa === 0) {
          this.hash = null;
          continue;
        }
        throw erro;
      }
      return r as T;
    }
  }

  async marcas(): Promise<ItemCatalogo[]> {
    const r = await this.estoque("ObterMarca", "");
    return comoLista(r, "MarcaWM").map((m: any) => ({ codigo: texto(m.CodigoMarca), nome: texto(m.NomeMarca) }));
  }
  async modelos(codigoMarca: string): Promise<ItemCatalogo[]> {
    const r = await this.estoque("ObterModelo", campos([["pCodigoMarca", codigoMarca]]));
    return comoLista(r, "ModeloWM").map((m: any) => ({ codigo: texto(m.CodigoModelo), nome: texto(m.NomeModelo) }));
  }
  /** Versões de um modelo (com os anos de modelo em que existem). */
  async versoes(codigoModelo: string): Promise<(ItemCatalogo & { anos: number[] })[]> {
    const r = await this.estoque("ObterVersao", campos([["pCodigoModelo", codigoModelo], ["pDataInicioAtualizacao", "1990-01-01T00:00:00"], ["pDataFimAtualizacao", new Date().toISOString().slice(0, 19)]]));
    return comoLista(r, "Versao").map((v: any) => ({
      codigo: texto(v.CodigoVersao),
      nome: texto(v.NomeVersao),
      anos: comoLista(v.AnoModelo, "AnoModeloWM").map((a: any) => Number(a.AnoModelo ?? a.Ano ?? a)).filter(Number.isFinite),
    }));
  }
  async cores(): Promise<ItemCatalogo[]> {
    return comoLista(await this.estoque("ObterCores", ""), "CorWM").map((c: any) => ({ codigo: texto(c.CodigoCor), nome: texto(c.Descricao) }));
  }
  async cambios(): Promise<ItemCatalogo[]> {
    return comoLista(await this.estoque("ObterCambio", ""), "TipoCambioWM").map((c: any) => ({ codigo: texto(c.CodigoCambio), nome: texto(c.Descricao) }));
  }
  async combustiveis(): Promise<ItemCatalogo[]> {
    return comoLista(await this.estoque("ObterCombustivel", ""), "CombustivelWM").map((c: any) => ({ codigo: texto(c.CodigoCombustivel), nome: texto(c.Descricao) }));
  }
  async opcionais(): Promise<ItemCatalogo[]> {
    return comoLista(await this.estoque("ObterOpcionais", ""), "OpcionalWM").map((c: any) => ({ codigo: texto(c.CodigoOpcional), nome: texto(c.Descricao) }));
  }
  /** Os planos de anúncio do pacote da loja, com quantos cabem e quantos já estão em uso. */
  async modalidades(): Promise<Modalidade[]> {
    return comoLista(await this.estoque("ObterModalidade", ""), "ModalidadeWM").map((m: any) => ({
      codigo: texto(m.CodigoModalidade),
      descricao: texto(m.Descricao),
      tipo: texto(m.TipoAnuncio),
      total: Number(m.QuantidadeAnunciosTotal ?? 0),
      usados: Number(m.QuantidadeAnuncios ?? 0),
    }));
  }

  /**
   * Os anúncios que a loja já tem na Webmotors (publicados por ela mesma, pelo Cockpit ou por
   * outro sistema, como a AutoCerto). Serve para o Zap ADOTAR o anúncio existente (casando pela
   * placa) em vez de criar um segundo. Pagina até o total informado.
   */
  async estoqueAtual(): Promise<AnuncioExistente[]> {
    const tamanho = 100;
    const todos: AnuncioExistente[] = [];
    for (let pagina = 1; pagina <= 100; pagina++) {
      const r = await this.estoque("ObterEstoqueAtualPaginado", campos([["pPagina", pagina], ["pTamanho", tamanho]]));
      const itens = comoLista(r?.Anuncios, "Anuncio") as any[];
      for (const a of itens) {
        const codigo = texto(a?.CodigoAnuncio);
        if (!codigo || codigo === "0") continue;
        todos.push({ codigo, placa: texto(a?.Placa).toUpperCase().replace(/[^A-Z0-9]/g, ""), modalidade: texto(a?.CodigoModalidade), km: Number(a?.Km ?? 0), preco: Number(a?.PrecoVenda ?? 0) });
      }
      const total = Number(r?.TotalAnuncios ?? 0);
      if (!itens.length || todos.length >= total) break;
    }
    return todos;
  }

  /** Inclui o carro e devolve o código do anúncio na Webmotors. */
  async incluirCarro(a: AnuncioWM): Promise<string> {
    const r = await this.estoque("IncluirCarro", `<pAnuncio>${anuncioXml(a)}</pAnuncio>`);
    const codigo = texto(r?.CodigoAnuncio);
    if (!codigo || codigo === "0") throw new ErroWebmotors("A Webmotors não devolveu o código do anúncio");
    return codigo;
  }
  async alterarCarro(a: AnuncioWM): Promise<void> {
    await this.estoque("AlterarCarro", `<pAnuncio>${anuncioXml(a)}</pAnuncio>`);
  }
  async excluirCarro(codigoAnuncio: string, motivo: string): Promise<void> {
    await this.estoque("ExcluirCarro", campos([["pCodigoAnuncio", codigoAnuncio], ["pMotivoExclusao", motivo]]));
  }
  async trocarModalidade(codigoAnuncio: string, codigoModalidade: string): Promise<void> {
    await this.estoque("TrocarModalidadeCarro", campos([["pCodigoAnuncio", codigoAnuncio], ["pCodigoModalidade", codigoModalidade]]));
  }

  async incluirFotoUrl(codigoAnuncio: string, url: string): Promise<void> {
    await this.estoque("IncluirFotoUrl", campos([["oUrlImagem", url], ["pCodigoAnuncio", codigoAnuncio]]));
  }
  async fotos(codigoAnuncio: string): Promise<{ codigo: string; ordem: number; url: string }[]> {
    const r = await this.estoque("ObterFotosCarro", campos([["pCodigoAnuncio", codigoAnuncio]]));
    return comoLista(comoLista(r, "FotosWM")[0]?.Fotos, "DetalheFotoWM").map((f: any) => ({ codigo: texto(f.CodigoFotoAnuncio), ordem: Number(f.Ordem ?? 0), url: texto(f.Url) }));
  }
  async excluirFoto(codigoAnuncio: string, codigoFoto: string): Promise<void> {
    await this.estoque("ExcluirFoto", campos([["pCodigoFoto", codigoFoto], ["pCodigoAnuncio", codigoAnuncio]]));
  }
}

export { ErroSoap };
