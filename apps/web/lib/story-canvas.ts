import QRCode from "qrcode";
import type { CardDoStory } from "./story-card";

/** Tamanho padrão de story (9:16). */
export const STORY_LARGURA = 1080;
export const STORY_ALTURA = 1920;
const FONTE = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

type Ctx = CanvasRenderingContext2D;
type Foto = { width: number; height: number } & CanvasImageSource;

/** Quebra o texto em até `maxLinhas` linhas que cabem em `largura`; o que sobra vira reticências na última. */
function quebrar(ctx: Ctx, texto: string, largura: number, maxLinhas: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (let i = 0; i < palavras.length; i++) {
    const tenta = atual ? `${atual} ${palavras[i]}` : palavras[i];
    if (ctx.measureText(tenta).width <= largura || !atual) {
      atual = tenta;
      continue;
    }
    if (linhas.length === maxLinhas - 1) {
      atual = [atual, ...palavras.slice(i)].join(" ");
      break;
    }
    linhas.push(atual);
    atual = palavras[i];
  }
  if (atual) linhas.push(atual);
  return linhas.map((l, i) => (i === linhas.length - 1 ? cortar(ctx, l, largura) : l));
}

function cortar(ctx: Ctx, texto: string, largura: number): string {
  if (ctx.measureText(texto).width <= largura) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > largura) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function retanguloArredondado(ctx: Ctx, x: number, y: number, l: number, a: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + a, r);
  ctx.arcTo(x + l, y + a, x, y + a, r);
  ctx.arcTo(x, y + a, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

/** Encolhe a fonte até o texto caber na largura (preço grande não pode invadir o QR Code). */
function ajustarFonte(ctx: Ctx, texto: string, peso: string, tamanho: number, minimo: number, largura: number): number {
  let t = tamanho;
  for (; t > minimo; t -= 2) {
    ctx.font = `${peso} ${t}px ${FONTE}`;
    if (ctx.measureText(texto).width <= largura) break;
  }
  ctx.font = `${peso} ${t}px ${FONTE}`;
  return t;
}

/**
 * Desenha o story do carro: a foto no alto, nome, ano, km e detalhes, o preço em destaque e o QR Code do link do carro
 * (story não leva link clicável, o QR leva o cliente até a ficha). Sem foto, o fundo fica liso.
 */
export async function desenharStory(canvas: HTMLCanvasElement, card: CardDoStory, foto: Foto | null): Promise<void> {
  const L = STORY_LARGURA;
  const A = STORY_ALTURA;
  canvas.width = L;
  canvas.height = A;
  const ctx = canvas.getContext("2d")!;
  const MARGEM = 64;
  const TAM_QR = 300;
  // Mede o texto antes: a foto cede o espaço que o texto precisar, para ele nunca passar por baixo do preço ou do QR Code.
  ctx.font = `800 96px ${FONTE}`;
  const linhasTitulo = quebrar(ctx, card.titulo, L - MARGEM * 2, 2);
  ctx.font = `600 44px ${FONTE}`;
  const caracteristicas = [card.ano, card.km, ...card.detalhes].filter(Boolean).join("  •  ");
  const linhasCaracteristicas = quebrar(ctx, caracteristicas, L - MARGEM * 2, 2);
  const alturaTexto = linhasTitulo.length * 100 + (card.versao ? 62 : 0) + linhasCaracteristicas.length * 62;
  const TOPO_DO_PRECO = A - 60 - TAM_QR - 16;
  const ALTURA_FOTO = Math.max(640, Math.min(1220, TOPO_DO_PRECO - 40 - 30 - alturaTexto));

  const fundo = ctx.createLinearGradient(0, 0, 0, A);
  fundo.addColorStop(0, "#0b1220");
  fundo.addColorStop(1, "#111827");
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, L, A);

  if (foto) {
    const esc = Math.max(L / foto.width, ALTURA_FOTO / foto.height);
    const w = foto.width * esc;
    const h = foto.height * esc;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, L, ALTURA_FOTO);
    ctx.clip();
    ctx.drawImage(foto, (L - w) / 2, (ALTURA_FOTO - h) / 2, w, h);
    ctx.restore();
  }
  // A foto some no fundo escuro, e o alto escurece um pouco para a faixa da loja ler bem.
  if (foto) {
    const sombraBaixo = ctx.createLinearGradient(0, ALTURA_FOTO - 420, 0, ALTURA_FOTO + 10);
    sombraBaixo.addColorStop(0, "rgba(11,18,32,0)");
    sombraBaixo.addColorStop(1, "#0b1220");
    ctx.fillStyle = sombraBaixo;
    ctx.fillRect(0, ALTURA_FOTO - 420, L, 430);
  }
  const sombraAlto = ctx.createLinearGradient(0, 0, 0, 260);
  sombraAlto.addColorStop(0, "rgba(0,0,0,0.55)");
  sombraAlto.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sombraAlto;
  ctx.fillRect(0, 0, L, 260);

  // Nome da loja.
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 42px ${FONTE}`;
  const loja = cortar(ctx, card.loja, L - MARGEM * 2 - 72);
  const larguraLoja = ctx.measureText(loja).width + 72;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  retanguloArredondado(ctx, MARGEM, 72, larguraLoja, 84, 42);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(loja, MARGEM + 36, 72 + 56);

  // Título, versão e características.
  let y = ALTURA_FOTO + 30;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 96px ${FONTE}`;
  for (const linha of linhasTitulo) {
    y += 100;
    ctx.fillText(linha, MARGEM, y);
  }
  if (card.versao) {
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `500 44px ${FONTE}`;
    y += 62;
    ctx.fillText(cortar(ctx, card.versao, L - MARGEM * 2), MARGEM, y);
  }
  ctx.fillStyle = "#e2e8f0";
  ctx.font = `600 44px ${FONTE}`;
  for (const linha of linhasCaracteristicas) {
    y += 62;
    ctx.fillText(linha, MARGEM, y);
  }

  // QR Code do link do carro (canto de baixo, à direita), e o preço no espaço que sobra à esquerda.
  const qrX = L - MARGEM - TAM_QR;
  const qrY = A - 60 - TAM_QR;
  const larguraTexto = card.link ? qrX - MARGEM - 40 : L - MARGEM * 2;
  if (card.link) {
    const url = await QRCode.toDataURL(card.link, { width: 520, margin: 1, errorCorrectionLevel: "M" });
    const qr = await new Promise<HTMLImageElement>((ok, erro) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => erro(new Error("QR Code"));
      img.src = url;
    });
    ctx.fillStyle = "#ffffff";
    retanguloArredondado(ctx, qrX - 16, qrY - 16, TAM_QR + 32, TAM_QR + 32, 28);
    ctx.fill();
    ctx.drawImage(qr, qrX, qrY, TAM_QR, TAM_QR);
  }

  const topoPreco = Math.max(y + 40, TOPO_DO_PRECO);
  if (card.preco) {
    const tam = ajustarFonte(ctx, card.preco, "800", 104, 56, larguraTexto - 72);
    const larg = ctx.measureText(card.preco).width + 72;
    ctx.fillStyle = "#16a34a";
    retanguloArredondado(ctx, MARGEM, topoPreco, larg, tam + 56, 28);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(card.preco, MARGEM + 36, topoPreco + tam + 8);
  } else {
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `700 60px ${FONTE}`;
    ctx.fillText("Preço sob consulta", MARGEM, topoPreco + 70);
  }
  ctx.fillStyle = "#94a3b8";
  ctx.font = `500 38px ${FONTE}`;
  const chamada = card.link ? "Aponte a câmera para o QR Code e veja o carro" : "Venha conhecer e fazer um test drive";
  const linhasChamada = quebrar(ctx, chamada, larguraTexto, 2);
  linhasChamada.forEach((l, i) => ctx.fillText(l, MARGEM, A - 60 - (linhasChamada.length - 1 - i) * 50));
}

/** O PNG do story. */
export async function gerarStory(card: CardDoStory, foto: Foto | null): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await desenharStory(canvas, card, foto);
  return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("não consegui gerar a imagem"))), "image/png"));
}
