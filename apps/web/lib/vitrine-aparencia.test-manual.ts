// Aparência da vitrine. Rodar de apps/web com: npx tsx lib/vitrine-aparencia.test-manual.ts
import { caminhoDaLoja, corDoTexto, corValida, horarioEmLinhas, linkFacebook, linkInstagram, mapaDoEndereco, politicaPadrao } from "./vitrine-aparencia";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

checa("cor válida em minúsculo", corValida(" #1F6F4A "), "#1f6f4a");
checa("cor sem #", corValida("1f6f4a"), null);
checa("cor curta", corValida("#fff"), null);
checa("cor com injeção de CSS", corValida("#000000;background:url(x)"), null);
checa("texto branco sobre fundo escuro", corDoTexto("#1f2937"), "#ffffff");
checa("texto escuro sobre fundo claro", corDoTexto("#fde047"), "#111827");
checa("texto sobre verde médio", corDoTexto("#1f6f4a"), "#ffffff");
checa("texto sobre branco", corDoTexto("#ffffff"), "#111827");

checa("instagram com @", linkInstagram("@salesautomoveis"), "https://www.instagram.com/salesautomoveis/");
checa("instagram com URL", linkInstagram("https://www.instagram.com/salesautomoveis/?hl=pt"), "https://www.instagram.com/salesautomoveis/");
checa("instagram sem protocolo", linkInstagram("instagram.com/sales.autos"), "https://www.instagram.com/sales.autos/");
checa("instagram com javascript:", linkInstagram("javascript:alert(1)"), null);
checa("instagram com espaço", linkInstagram("sales autos"), null);
checa("instagram vazio", linkInstagram(""), null);
checa("facebook por profile.php", linkFacebook("https://www.facebook.com/profile.php?id=100095452331638"), "https://www.facebook.com/profile.php?id=100095452331638");
checa("facebook por nome", linkFacebook("salesautomoveis"), "https://www.facebook.com/salesautomoveis");
checa("facebook por URL com barra", linkFacebook("https://facebook.com/sales.autos/"), "https://www.facebook.com/sales.autos");
checa("facebook com javascript:", linkFacebook("javascript:alert(1)"), null);
checa("facebook com outro domínio", linkFacebook("https://evil.com/x"), null);

const m = mapaDoEndereco("Av. Brigadeiro Lima e Silva, nº 1120 - Duque de Caxias/RJ");
checa("mapa embutido", m?.embed.startsWith("https://www.google.com/maps?q=Av.%20Brigadeiro") && m.embed.endsWith("&output=embed"), true);
checa("link para abrir", m?.abrir.startsWith("https://www.google.com/maps/search/?api=1&query="), true);
checa("endereço curto demais", mapaDoEndereco("rua"), null);
checa("mapa não deixa o texto virar HTML", mapaDoEndereco('"><script>alert(1)</script> rua x')?.embed.includes("<"), false);

checa("horário em linhas", horarioEmLinhas("Seg a Sex 8h às 18h\n\n Sáb 8h às 12h "), ["Seg a Sex 8h às 18h", "Sáb 8h às 12h"]);
checa("horário vazio", horarioEmLinhas(null), []);

checa("caminho no domínio próprio", [caminhoDaLoja("sales", "www.sales.com.br"), caminhoDaLoja("sales", "www.sales.com.br", "financiamento")], ["/", "/financiamento"]);
checa("caminho no endereço do Zap", [caminhoDaLoja("sales"), caminhoDaLoja("sales", null, "localizacao")], ["/loja/sales", "/loja/sales/localizacao"]);

const base = { nome: "Sales Automóveis", endereco: "Av. Brigadeiro Lima e Silva, 1120, Duque de Caxias/RJ", whatsapp: "5521967629631" };
const sem = politicaPadrao({ ...base, usaPixel: false, usaAnalytics: false });
const com = politicaPadrao({ ...base, usaPixel: true, usaAnalytics: true });
checa("política cita a loja e a LGPD", [sem[0].texto.includes("Sales Automóveis"), sem[0].texto.includes("13.709")], [true, true]);
checa("contato formatado nos direitos", sem.find((s) => s.titulo === "Seus direitos")?.texto.includes("WhatsApp (21) 96762-9631"), true);
checa("sem pixel: não fala em rastreamento", [sem.find((s) => s.titulo === "Cookies")?.texto.includes("não usa cookies"), JSON.stringify(sem).includes("Pixel")], [true, false]);
checa("com pixel e analytics: avisa", [JSON.stringify(com).includes("Pixel da Meta"), JSON.stringify(com).includes("Google Analytics")], [true, true]);
checa("8 seções", sem.length, 8);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
