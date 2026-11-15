// Meu site > Dados da loja, WhatsApp e Avançado. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/dados-da-loja.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { dadosDaLoja, idDeMedicao, lerPontoDoMapa, mapaDaLoja, mensagemDoWhatsapp, montarEndereco, montarHorario, salvarAvancado, salvarDadosDaLoja, salvarWhatsappDoSite, telefonesDaLoja } from "./dados-da-loja";
import { cidadeDaLoja } from "./vitrine-seo";
import { lojaPublica } from "./vitrine";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

async function main() {
  // partes puras
  const end = montarEndereco({ logradouro: "Av. Brigadeiro Lima e Silva, nº 1120", bairro: "Centro", cidade: "Duque de Caxias", uf: "RJ" });
  checa("endereço montado e a cidade continua sendo achada (SEO)", [end, cidadeDaLoja(end)], ["Av. Brigadeiro Lima e Silva, nº 1120 · Centro · Duque de Caxias/RJ", "Duque de Caxias"]);
  checa("horário: faixa em branco vira Fechado; tudo em branco = sem horário", [montarHorario({ semana: "8h às 19h", sabado: "8h às 16h" }), montarHorario({})], ["Segunda a sexta: 8h às 19h\nSábado: 8h às 16h\nDomingo: Fechado", null]);
  checa("ponto do mapa: coordenadas, link com @ e com !3d!4d; lixo não", [
    lerPontoDoMapa("-22.79373, -43.29856"),
    lerPontoDoMapa("https://www.google.com/maps/place/Sales/@-22.7937,-43.2985,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-22.79373!4d-43.29856"),
    lerPontoDoMapa("https://www.google.com/maps/@-22.7937,-43.2985,17z"),
    lerPontoDoMapa("rua tal"),
    lerPontoDoMapa("-122.5, 10.1"),
  ], [{ lat: -22.79373, lng: -43.29856 }, { lat: -22.79373, lng: -43.29856 }, { lat: -22.7937, lng: -43.2985 }, null, null]);
  checa("mapa: pelo ponto, senão pelo endereço; desligado = sem mapa", [
    mapaDaLoja({ mapaAtivo: true, mapaLat: -22.1, mapaLng: -43.2, endereco: "x" })?.abrir,
    mapaDaLoja({ mapaAtivo: true, mapaLat: null, mapaLng: null, endereco: "Rua A, 10 · Centro" })?.abrir,
    mapaDaLoja({ mapaAtivo: false, mapaLat: -22.1, mapaLng: -43.2, endereco: "Rua A, 10" }),
  ], ["https://www.google.com/maps/search/?api=1&query=-22.1,-43.2", "https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%2010%20%C2%B7%20Centro", null]);
  checa("mensagem do WhatsApp: a da loja ou a padrão com o nome", [mensagemDoWhatsapp("  Oi!  ", "X"), mensagemDoWhatsapp("", "Sales")], ["Oi!", "Olá! Vim pelo site Sales e quero mais informações."]);
  checa("IDs de medição: só no formato certo (o valor vai para dentro de script)", [idDeMedicao("gtmId", "gtm-abc1234"), idDeMedicao("gtmId", "GTM-1');alert(1)//"), idDeMedicao("googleAdsId", "AW-123456789"), idDeMedicao("googleAdsId", "123")], ["GTM-ABC1234", null, "AW-123456789", null]);
  checa("telefones guardados com lixo: só os válidos", telefonesDaLoja([{ tipo: "WHATSAPP", numero: "5521967629631" }, { tipo: "PAGER", numero: "5521967629631" }, { tipo: "FIXO", numero: "123" }, "x"]), [{ tipo: "WHATSAPP", numero: "5521967629631" }]);

  // salvando
  await prisma.tenant.deleteMany({ where: { slug: "teste-dados-loja" } });
  const t = await prisma.tenant.create({ data: { name: "Sales Teste", slug: "teste-dados-loja" } });
  await prisma.veiculosConfig.create({ data: { tenantId: t.id, endereco: "Endereço antigo, 1", horario: "Seg a sex 9 às 18" } });
  checa("dados antigos aparecem para migrar (endereço no campo do endereço, horário como aviso)", await dadosDaLoja(t.id).then((d) => [d.logradouro, d.horarioAntigo]), ["Endereço antigo, 1", "Seg a sex 9 às 18"]);
  checa("CEP errado é recusado", (await salvarDadosDaLoja(t.id, { cep: "123" })).ok, false);
  checa("telefone sem DDD é recusado", (await salvarDadosDaLoja(t.id, { telefones: [{ tipo: "WHATSAPP", numero: "96762-9631" }] })).ok, false);
  checa("ponto do mapa inválido é recusado", (await salvarDadosDaLoja(t.id, { ponto: "na esquina" })).ok, false);
  checa("mais de 3 telefones é recusado", (await salvarDadosDaLoja(t.id, { telefones: Array.from({ length: 4 }, () => ({ tipo: "FIXO", numero: "2133334444" })) })).ok, false);
  const r = await salvarDadosDaLoja(t.id, {
    cep: "25071-182", logradouro: "Av. Brigadeiro Lima e Silva, nº 1120", bairro: "Centro", cidade: "Duque de Caxias", uf: "rj",
    telefones: [{ tipo: "WHATSAPP", numero: "(21) 96762-9631" }, { tipo: "FIXO", numero: "+55 21 3333-4444" }, { tipo: "WHATSAPP", numero: "" }],
    mapaAtivo: true, ponto: "-22.79373, -43.29856", horarioSemana: "8h às 19h", horarioSabado: "8h às 16h",
  });
  const c = await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } });
  checa("salvo: endereço e horário montados, telefones com DDI, ponto do mapa", [r.ok, c.endereco, c.horario, c.telefones, c.mapaLat, c.uf], [true, "Av. Brigadeiro Lima e Silva, nº 1120 · Centro · Duque de Caxias/RJ", "Segunda a sexta: 8h às 19h\nSábado: 8h às 16h\nDomingo: Fechado", [{ tipo: "WHATSAPP", numero: "5521967629631" }, { tipo: "FIXO", numero: "552133334444" }], -22.79373, "RJ"]);
  checa("como no AutoCerto: CEP e 1º telefone vão para os anúncios dos portais", [c.cepAnuncios, c.telefoneAnuncios], ["25071182", "21967629631"]);
  checa("tela mostra os telefones formatados", (await dadosDaLoja(t.id)).telefones, [{ tipo: "WHATSAPP", numero: "(21) 96762-9631" }, { tipo: "FIXO", numero: "(21) 3333-4444" }]);

  checa("WhatsApp inválido é recusado", (await salvarWhatsappDoSite(t.id, { numero: "123" })).ok, false);
  await salvarWhatsappDoSite(t.id, { numero: "(21) 96762-9631", mensagem: "Olá! Vim pelo site Sales Automoveis e quero mais informações." });
  checa("WhatsApp do site salvo", await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } }).then((x) => [x.whatsapp, x.whatsappMensagem]), ["5521967629631", "Olá! Vim pelo site Sales Automoveis e quero mais informações."]);

  checa("Avançado: ID fora do formato é recusado", (await salvarAvancado(t.id, { gtmId: "<script>" })).ok, false);
  await salvarAvancado(t.id, { metaPixelId: "123456789", ga4Id: "g-abc1234", googleAdsId: "AW-1234567", gtmId: "" });
  checa("Avançado salvo (normalizado; vazio apaga)", await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } }).then((x) => [x.metaPixelId, x.ga4Id, x.googleAdsId, x.gtmId]), ["123456789", "G-ABC1234", "AW-1234567", null]);
  await salvarAvancado(t.id, { gtmId: "GTM-ABCD12" });
  checa("Avançado: campo não enviado fica como está", await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } }).then((x) => [x.metaPixelId, x.gtmId]), ["123456789", "GTM-ABCD12"]);

  // no site público (se o recurso VEICULOS estiver liberado nesta base de teste)
  await prisma.veiculosConfig.update({ where: { tenantId: t.id }, data: { vitrineAtiva: true } });
  await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "VEICULOS", ativo: true, motivo: "teste" } });
  const loja = await lojaPublica("teste-dados-loja");
  if (loja) checa("site público: telefones, mapa pelo ponto, mensagem e endereço em partes", [loja.telefones.length, loja.mapa?.abrir, loja.mensagemWhatsapp, loja.enderecoPartes.cidade, loja.gtmId], [2, "https://www.google.com/maps/search/?api=1&query=-22.79373,-43.29856", "Olá! Vim pelo site Sales Automoveis e quero mais informações.", "Duque de Caxias", "GTM-ABCD12"]);
  else console.log("(site público não testado: a loja de teste não tem o recurso VEICULOS)");

  await prisma.tenant.delete({ where: { id: t.id } });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
