// Cadastro no jeito do AutoCerto. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/veiculos-cadastro.test-manual.ts
import { paraOPortal } from "@dilon-zap/portais";
import { idDoYoutube, qualidadeDoAnuncio } from "./veiculos-cadastro";
import { dadosParaBanco } from "./veiculos";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

checa("YouTube: watch, youtu.be, shorts; outro site não", [idDoYoutube("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), idDoYoutube("https://youtu.be/dQw4w9WgXcQ"), idDoYoutube("https://youtube.com/shorts/dQw4w9WgXcQ"), idDoYoutube("https://vimeo.com/123")], ["dQw4w9WgXcQ", "dQw4w9WgXcQ", "dQw4w9WgXcQ", null]);

const cheio = { fotos: 10, precoCents: 5_000_000, km: "45000", versao: "1.0 Drive", cor: "Prata", cambio: "Manual", combustivel: "Flex", opcionais: 6, descricao: "Único dono, revisado, manual e chave reserva, aceitamos troca.", caracteristicas: 2, placa: "ABC1D23" };
checa("anúncio completo = 100%", qualidadeDoAnuncio(cheio).nota, 100);
const pela = qualidadeDoAnuncio({ ...cheio, fotos: 2, opcionais: 0, placa: "" });
checa("sem fotos, opcionais e placa: perde 40 e diz o que falta", [pela.nota, pela.falta], [60, ["8 fotos ou mais", "5 opcionais ou mais", "Placa (os portais usam para conferir o carro)"]]);
checa("0 km conta como km informada", qualidadeDoAnuncio({ ...cheio, km: "", zeroKm: true }).nota, 100);

const v = { precoCents: 5_000_000, descricao: "Texto do site", precoClassificadosCents: 5_200_000, descricaoClassificados: null, ajustesPorPortal: { WEBMOTORS: { precoCents: 4_990_000, descricao: "Só na Webmotors" } } };
checa("portal: classificados por padrão, ajuste do portal por cima", [paraOPortal(v, "OLX").precoCents, paraOPortal(v, "OLX").descricao, paraOPortal(v, "WEBMOTORS").precoCents, paraOPortal(v, "WEBMOTORS").descricao], [5_200_000, "Texto do site", 4_990_000, "Só na Webmotors"]);
checa("portal: sem nada diferente, o mesmo do site", [paraOPortal({ precoCents: 1, descricao: "a" }, "NAPISTA").precoCents, paraOPortal({ precoCents: 1, descricao: "a", descricaoClassificados: "b" }, "NAPISTA").descricao], [1, "b"]);

const b = dadosParaBanco({ caracteristicas: ["IPVA pago", "IPVA pago"], videoUrl: "https://youtu.be/dQw4w9WgXcQ", precoClassificadosCents: 0, ajustesPorPortal: { OLX: { precoCents: null, descricao: null }, MOBIAUTO: { precoCents: 100, descricao: "" } } });
checa("banco: sem repetição, classificados zero = mesmo do site, só o portal que muda algo", [b.caracteristicas, b.precoClassificadosCents, b.ajustesPorPortal], [["IPVA pago"], null, { MOBIAUTO: { precoCents: 100 } }]);
let erro = "";
try { dadosParaBanco({ videoUrl: "https://vimeo.com/1" }); } catch (e) { erro = (e as Error).message; }
checa("vídeo que não é do YouTube é recusado", erro, "vídeo: use um link do YouTube");

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
