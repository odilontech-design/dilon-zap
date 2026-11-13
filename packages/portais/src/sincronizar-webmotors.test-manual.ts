// Sincronização com a Webmotors de ponta a ponta: Postgres + servidor SOAP falso.
// Rodar com: DATABASE_URL=postgresql://... npx tsx packages/portais/src/sincronizar-webmotors.test-manual.ts
import http from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// ---- O servidor falso -------------------------------------------------------------------------
const NS = "www.webmotors.com.br/wsEstoqueRevendedorWebMotors";
const anuncios = new Map<number, Record<string, string>>();
const fotos = new Map<number, { codigo: number; url: string }[]>();
const chamadas: string[] = [];
let proximo = 5000;
let proximaFoto = 1;
let expirarUmaVez = false;
let fora = false;
let recusarCodigo: number | null = null; // devolve 400 ao incluir esse CodigoModelo
let loginOk = true;

const tag = (xml: string, nome: string) => xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1] ?? "";
const env = (op: string, ns: string, resultado: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op}Response xmlns="${ns}"><${op}Result>${resultado}</${op}Result></${op}Response></soap:Body></soap:Envelope>`;
const lista = (item: string, itens: string[][]) => itens.map((c) => `<${item}>${c.join("")}</${item}>`).join("");
const t = (n: string, v: string | number) => `<${n}>${v}</${n}>`;

const servidor = http.createServer((req, res) => {
  let corpo = "";
  req.on("data", (c) => (corpo += c));
  req.on("end", () => {
    if (fora) return void req.socket.destroy();
    const op = (req.headers.soapaction as string).replace(/"/g, "").split("/").pop()!;
    chamadas.push(op);
    const responder = (xml: string) => { res.writeHead(200, { "Content-Type": "text/xml" }); res.end(xml); };
    if (op === "autenticar") {
      const ok = loginOk && tag(corpo, "cnpj") === "20458995000146" && tag(corpo, "email") === "integracao@loja.com" && tag(corpo, "senha") === "segredo";
      return responder(env(op, "www.webmotors.com.br/wsLoginSistemaRevendedor", ok ? t("HashAutenticacao", "HASH-1") + t("CodigoRetorno", 500) : t("CodigoRetorno", 403)));
    }
    if (tag(corpo, "pHashAutenticacao") !== "HASH-1") return responder(env(op, NS, t("CodigoRetorno", 401)));
    if (expirarUmaVez) { expirarUmaVez = false; return responder(env(op, NS, t("CodigoRetorno", 402))); }
    const cod = Number(tag(corpo, "pCodigoAnuncio") || tag(corpo, "CodigoAnuncio"));
    switch (op) {
      case "ObterMarca": return responder(env(op, NS, lista("MarcaWM", [[t("CodigoMarca", 21), t("NomeMarca", "FIAT"), t("CodigoRetorno", 500)], [t("CodigoMarca", 60), t("NomeMarca", "VOLKSWAGEN"), t("CodigoRetorno", 500)]])));
      case "ObterModelo": return responder(env(op, NS, tag(corpo, "pCodigoMarca") === "21" ? lista("ModeloWM", [[t("CodigoMarca", 21), t("CodigoModelo", 189), t("NomeModelo", "ARGO"), t("CodigoRetorno", 500)], [t("CodigoMarca", 21), t("CodigoModelo", 190), t("NomeModelo", "MOBI"), t("CodigoRetorno", 500)]]) : ""));
      case "ObterVersao": return responder(env(op, NS, ["189", "190"].includes(tag(corpo, "pCodigoModelo")) ? lista("Versao", [[t("CodigoModelo", tag(corpo, "pCodigoModelo")), t("CodigoVersao", tag(corpo, "pCodigoModelo") === "189" ? 311168 : 311169), t("NomeVersao", "1.0 FIREFLY FLEX DRIVE MANUAL"), `<AnoModelo><AnoModeloWM>${t("AnoModelo", 2021)}</AnoModeloWM></AnoModelo>`, t("CodigoRetorno", 500)]]) : ""));
      case "ObterCores": return responder(env(op, NS, lista("CorWM", [[t("CodigoCor", "30409"), t("Descricao", "Branco"), t("CodigoRetorno", 500)], [t("CodigoCor", "30410"), t("Descricao", "Prata"), t("CodigoRetorno", 500)]])));
      case "ObterCambio": return responder(env(op, NS, lista("TipoCambioWM", [[t("CodigoCambio", "1"), t("Descricao", "Manual"), t("CodigoRetorno", 500)], [t("CodigoCambio", "2"), t("Descricao", "Automático"), t("CodigoRetorno", 500)]])));
      case "ObterCombustivel": return responder(env(op, NS, lista("CombustivelWM", [[t("CodigoCombustivel", "3"), t("Descricao", "Flex"), t("CodigoRetorno", 500)]])));
      case "ObterOpcionais": return responder(env(op, NS, lista("OpcionalWM", [[t("CodigoOpcional", 50), t("Descricao", "Ar condicionado"), t("CodigoRetorno", 500)]])));
      case "IncluirCarro": {
        if (recusarCodigo && Number(tag(corpo, "CodigoModelo")) === recusarCodigo) return responder(env(op, NS, t("CodigoRetorno", 400)));
        for (const campo of ["CodigoModalidade", "CodigoMarca", "Km", "PrecoVenda", "NrPortas", "CodigoCor"]) if (!tag(corpo, campo)) return responder(env(op, NS, t("CodigoRetorno", 400)));
        const codigo = proximo++;
        anuncios.set(codigo, { modalidade: tag(corpo, "CodigoModalidade"), preco: tag(corpo, "PrecoVenda"), km: tag(corpo, "Km"), placa: tag(corpo, "Placa") });
        fotos.set(codigo, []);
        return responder(env(op, NS, t("CodigoAnuncio", codigo) + t("CodigoRetorno", 500)));
      }
      case "AlterarCarro": {
        const a = anuncios.get(cod); if (!a) return responder(env(op, NS, t("CodigoRetorno", 400)));
        a.preco = tag(corpo, "PrecoVenda"); a.km = tag(corpo, "Km");
        return responder(env(op, NS, t("CodigoAnuncio", cod) + t("CodigoRetorno", 500)));
      }
      case "ExcluirCarro": anuncios.delete(cod); fotos.delete(cod); return responder(env(op, NS, t("CodigoAnuncio", cod) + t("CodigoRetorno", 500)));
      case "TrocarModalidadeCarro": { const a = anuncios.get(cod); if (a) a.modalidade = tag(corpo, "pCodigoModalidade"); return responder(env(op, NS, t("CodigoRetorno", 500))); }
      case "IncluirFotoUrl": { const f = fotos.get(cod); f?.push({ codigo: proximaFoto++, url: tag(corpo, "oUrlImagem") }); return responder(env(op, NS, t("CodigoAnuncio", cod) + t("CodigoRetorno", 500))); }
      case "ObterFotosCarro": return responder(env(op, NS, `<FotosWM>${t("CodigoAnuncio", cod)}<Fotos>${(fotos.get(cod) ?? []).map((f, i) => `<DetalheFotoWM>${t("CodigoFotoAnuncio", f.codigo)}${t("Ordem", i)}${t("Url", f.url)}</DetalheFotoWM>`).join("")}</Fotos>${t("CodigoRetorno", 500)}</FotosWM>`));
      case "ExcluirFoto": { const f = fotos.get(cod); if (f) fotos.set(cod, f.filter((x) => x.codigo !== Number(tag(corpo, "pCodigoFoto")))); return responder(env(op, NS, t("CodigoRetorno", 500))); }
      default: return responder(env(op, NS, t("CodigoRetorno", 400)));
    }
  });
});

async function main() {
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  process.env.WEBMOTORS_URL_BASE = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const { prisma } = await import("@dilon-zap/db");
  const { cicloWebmotors, cifrar, assinarFoto } = await import("./index");

  await prisma.tenant.deleteMany({ where: { slug: "teste-webmotors" } });
  const t0 = await prisma.tenant.create({ data: { name: "Loja Webmotors", slug: "teste-webmotors" } });
  const chave = randomBytes(32);
  const segredo = "segredo-fotos";
  const op = { chave, segredoFotos: segredo, urlBase: "https://zap.exemplo.com.br" };
  const cred = JSON.stringify({ cnpj: "20.458.995/0001-46", email: "integracao@loja.com", senha: "segredo" });
  const conta = await prisma.portalConta.create({ data: { tenantId: t0.id, portal: "WEBMOTORS", status: "CONECTADA", accessTokenCripto: cifrar(cred, chave), planoPadrao: "189" } });

  const novo = async (marca: string, modelo: string, extra: object = {}, comFoto = true) => {
    const v = await prisma.veiculo.create({
      data: { tenantId: t0.id, marca, modelo, versao: "1.0 FIREFLY FLEX DRIVE MANUAL 4P", anoFabricacao: 2021, anoModelo: 2021, km: 31000, kmInformado: true, cor: "Branco", combustivel: "Flex", cambio: "Manual", precoCents: 5_599_999, status: "DISPONIVEL", origem: "COMPRA", placa: "RMO1H85", ...extra },
    });
    const fts = comFoto ? [await prisma.fotoVeiculo.create({ data: { tenantId: t0.id, veiculoId: v.id, key: `k/${v.id}-1.jpg`, ordem: 0 } }), await prisma.fotoVeiculo.create({ data: { tenantId: t0.id, veiculoId: v.id, key: `k/${v.id}-2.jpg`, ordem: 1 } })] : [];
    await prisma.publicacaoPortal.create({ data: { tenantId: t0.id, veiculoId: v.id, portal: "WEBMOTORS", idEnviado: v.id.slice(-12) } });
    return { v, fts };
  };
  const a = await novo("Fiat", "Argo");
  const b = await novo("Fiat", "Argo", { km: 0, kmInformado: false });
  const c = await novo("Ferrari", "F40");
  const estado = (v: { id: string }) => prisma.publicacaoPortal.findUniqueOrThrow({ where: { veiculoId_portal: { veiculoId: v.id, portal: "WEBMOTORS" } } });
  const n = (nome: string) => chamadas.filter((x) => x === nome).length;

  // 1) Primeira rodada.
  const r1 = await cicloWebmotors(op);
  const pa = await estado(a.v);
  checa("Argo: publicado e com o código da Webmotors", [pa.status, pa.idExterno, r1.enviados], ["PUBLICADO", "5000", 1]);
  checa("o anúncio chegou com a modalidade, o preço e a km", anuncios.get(5000), { modalidade: "189", preco: "55999.99", km: "31000", placa: "RMO1H85" });
  checa("as 2 fotos foram por endereço assinado, na ordem", fotos.get(5000)?.map((f) => f.url), a.fts.map((f) => `https://zap.exemplo.com.br/api/portais/foto/${f.id}/${assinarFoto(f.id, segredo)}.jpg`));
  const pb = await estado(b.v);
  checa("sem km informada: NÃO publica e diz por quê", [pb.status, pb.idExterno, pb.erro], ["FILA", null, "Falta para anunciar: Informar a quilometragem do carro (a Webmotors exige a km)"]);
  const pc = await estado(c.v);
  checa("marca fora do catálogo: pendência clara", pc.erro?.includes('Marca "Ferrari" não identificada'), true);
  checa("só 1 carro foi incluído", n("IncluirCarro"), 1);
  checa("login uma vez só na rodada", n("autenticar"), 1);

  // 2) Nada mudou: nada é enviado.
  const antes = chamadas.length;
  await cicloWebmotors(op);
  checa("rodada sem mudança não chama a Webmotors (só o login)", chamadas.slice(antes).filter((x) => !/^(autenticar|Obter)/.test(x)), []);

  // 3) Preço novo: altera, não inclui de novo, e não reenvia as fotos.
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { precoCents: 5_299_999 } });
  await cicloWebmotors(op);
  checa("preço novo: AlterarCarro, mesmo código, fotos intactas", [anuncios.get(5000)?.preco, n("IncluirCarro"), n("AlterarCarro"), n("ExcluirFoto"), fotos.get(5000)?.length], ["52999.99", 1, 1, 0, 2]);

  // 4) Foto nova: refaz as fotos.
  await prisma.fotoVeiculo.create({ data: { tenantId: t0.id, veiculoId: a.v.id, key: "k/nova.jpg", ordem: 2 } });
  await cicloWebmotors(op);
  checa("foto nova: apaga as de lá e reenvia as 3", [n("ExcluirFoto"), fotos.get(5000)?.length], [2, 3]);

  // 5) Trocou o plano do carro.
  await prisma.publicacaoPortal.update({ where: { id: pa.id }, data: { plano: "200" } });
  await cicloWebmotors(op);
  checa("plano novo: TrocarModalidadeCarro", [n("TrocarModalidadeCarro"), anuncios.get(5000)?.modalidade], [1, "200"]);

  // 6) Sessão que vence no meio: reautentica sozinho.
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { precoCents: 5_199_999 } });
  expirarUmaVez = true;
  const logins = n("autenticar");
  await cicloWebmotors(op);
  checa("sessão vencida (402): entra de novo e conclui", [n("autenticar") - logins >= 1, anuncios.get(5000)?.preco], [true, "51999.99"]);

  // 7) Erro de um anúncio não derruba os outros.
  const d = await novo("Fiat", "Argo");
  const e = await novo("Fiat", "Mobi", {}, true);
  recusarCodigo = 190;
  const r7 = await cicloWebmotors(op);
  const pd = await estado(d.v), pe = await estado(e.v);
  checa("um recusado (400), o outro entra", [pd.status, pe.status, pe.erro, r7.erros], ["PUBLICADO", "ERRO", "Falha inesperada na Webmotors", 1]);
  checa("o recusado espera a próxima tentativa", [pe.tentativas, !!pe.proximaTentativaEm], [1, true]);
  recusarCodigo = null;

  // 8) Vendeu: sai do ar.
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { status: "VENDIDO" } });
  const r8 = await cicloWebmotors(op);
  const pa2 = await estado(a.v);
  checa("vendido: ExcluirCarro, REMOVIDO e sem código", [pa2.status, pa2.idExterno, anuncios.has(5000), r8.removidos], ["REMOVIDO", null, false, 1]);

  // 9) Webmotors fora do ar: nada é marcado como erro de carro; a conta mostra o motivo.
  await prisma.veiculo.update({ where: { id: d.v.id }, data: { precoCents: 4_000_000 } });
  fora = true;
  await cicloWebmotors(op);
  fora = false;
  const cc = await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } });
  checa("fora do ar: o carro segue publicado e a conta avisa", [(await estado(d.v)).status, cc.status, cc.erro], ["PUBLICADO", "CONECTADA", "a Webmotors não respondeu"]);

  // 10) Credencial recusada: a conta pede reconexão.
  loginOk = false;
  await prisma.veiculo.update({ where: { id: d.v.id }, data: { precoCents: 4_100_000 } });
  await cicloWebmotors(op);
  loginOk = true;
  const cd = await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } });
  checa("login recusado: conta em erro", [cd.status, cd.erro?.includes("não aceitou")], ["ERRO", true]);
  const antesErro = chamadas.length;
  await cicloWebmotors(op);
  checa("conta em erro não é chamada", chamadas.length, antesErro);

  await prisma.tenant.delete({ where: { id: t0.id } });
  await prisma.$disconnect();
  servidor.close();
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((err) => { console.error(err); process.exit(1); });
