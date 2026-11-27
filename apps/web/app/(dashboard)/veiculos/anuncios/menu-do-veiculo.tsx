"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import type { CarroDaGrade } from "@/lib/grade-portais-filtros";
import { montarZip } from "@/lib/zip-simples";
import { erroDaResposta } from "../comum";

type Aviso = { texto: string; erro?: boolean };
type PortalLigado = { portal: string; nome: string };

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = texto;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

/**
 * O menu "⋯" de cada carro da grade, no jeito do AutoCerto: abrir a ficha, compartilhar, ver no site, copiar o descritivo, baixar
 * as fotos, QR Code, gráfico de acessos e tirar de todos os portais. O menu abre em posição fixa para a rolagem da tabela não cortá-lo.
 */
export function MenuDoVeiculo({ carro, portaisAtivos, aoMudar, avisar }: { carro: CarroDaGrade; portaisAtivos: PortalLigado[]; aoMudar: () => void; avisar: (a: Aviso) => void }) {
  const [aberto, setAberto] = useState<{ x: number; y: number } | null>(null);
  const [modal, setModal] = useState<"qr" | "acessos" | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmaTirar, setConfirmaTirar] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const fechar = useCallback(() => {
    setAberto(null);
    setConfirmaTirar(false);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node) && !botao.current?.contains(e.target as Node)) fechar();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("scroll", fechar, true);
    };
  }, [aberto, fechar]);

  function abrir() {
    if (aberto) return fechar();
    const r = botao.current!.getBoundingClientRect();
    const larg = 240;
    const alto = 380;
    setAberto({ x: Math.max(8, Math.min(r.right - larg, window.innerWidth - larg - 8)), y: r.bottom + alto > window.innerHeight ? Math.max(8, r.top - alto) : r.bottom + 4 });
  }

  async function descritivo() {
    const r = await fetch(`/api/veiculos/${carro.id}/descritivo`);
    if (!r.ok) throw new Error(await erroDaResposta(r));
    return (await r.json()) as { texto: string; link: string | null; placa: string | null; fotoIds: string[] };
  }

  async function executar(nome: string, fazer: () => Promise<void>) {
    setOcupado(nome);
    try {
      await fazer();
    } catch (e) {
      avisar({ texto: e instanceof Error ? e.message : "não deu certo", erro: true });
    } finally {
      setOcupado(null);
      fechar();
    }
  }

  const copiarLink = () => executar("link", async () => avisar((await copiar(carro.linkPublico!)) ? { texto: "Link do carro copiado." } : { texto: "Não consegui copiar o link.", erro: true }));
  const copiarDescritivo = () => executar("descritivo", async () => avisar((await copiar((await descritivo()).texto)) ? { texto: "Descritivo copiado: é só colar no anúncio ou na conversa." } : { texto: "Não consegui copiar.", erro: true }));
  const porWhatsApp = () =>
    executar("whatsapp", async () => {
      const d = await descritivo();
      window.open(`https://wa.me/?text=${encodeURIComponent(d.texto)}`, "_blank", "noopener");
    });

  const baixarFotos = () =>
    executar("fotos", async () => {
      const d = await descritivo();
      if (!d.fotoIds.length) throw new Error("Este carro não tem fotos.");
      const arquivos: { nome: string; dados: Uint8Array }[] = [];
      for (const [i, id] of d.fotoIds.slice(0, 40).entries()) {
        const r = await fetch(`/api/veiculos/fotos/${id}?baixar=1`);
        if (!r.ok) continue;
        const tipo = r.headers.get("content-type") ?? "";
        const ext = tipo.includes("webp") ? "webp" : tipo.includes("png") ? "png" : "jpg";
        arquivos.push({ nome: `${(d.placa ?? "carro").replace(/[^A-Za-z0-9]/g, "")}-${String(i + 1).padStart(2, "0")}.${ext}`, dados: new Uint8Array(await r.arrayBuffer()) });
      }
      if (!arquivos.length) throw new Error("Não consegui baixar as fotos.");
      const url = URL.createObjectURL(new Blob([montarZip(arquivos) as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `fotos-${(d.placa ?? carro.nome).replace(/[^A-Za-z0-9]+/g, "-")}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      avisar({ texto: `${arquivos.length} foto(s) baixadas.` });
    });

  const tirarDeTodos = () =>
    executar("tirar", async () => {
      let tirados = 0;
      for (const p of portaisAtivos) {
        const r = await fetch(`/api/veiculos/${carro.id}/portais`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portal: p.portal, ativo: false }) });
        if (!r.ok) throw new Error(`${p.nome}: ${await erroDaResposta(r)}`);
        tirados++;
      }
      avisar({ texto: `${carro.nome} saiu de ${tirados} portal(is).` });
      aoMudar();
    });

  const item = "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent";
  const separador = <div className="my-1 border-t border-neutral-100" role="separator" />;

  return (
    <>
      <button ref={botao} type="button" onClick={abrir} aria-haspopup="menu" aria-expanded={!!aberto} aria-label={`Mais ações de ${carro.nome}`} className="rounded border border-neutral-200 px-1.5 py-0.5 text-sm leading-none text-neutral-500 hover:border-accent hover:text-accent">
        ⋯
      </button>
      {aberto && (
        <div ref={caixa} role="menu" style={{ position: "fixed", left: aberto.x, top: aberto.y, width: 240 }} className="z-50 max-h-[80vh] overflow-auto rounded-lg border border-neutral-200 bg-surface p-1 shadow-xl">
          <Link role="menuitem" href={`/veiculos/${carro.id}`} className={item} onClick={fechar}>
            Abrir a ficha
          </Link>
          {separador}
          <button role="menuitem" type="button" className={item} disabled={!carro.linkPublico || !!ocupado} onClick={copiarLink} title={carro.linkPublico ? undefined : "A vitrine está desligada ou o carro está fora dela"}>
            Copiar link do carro
          </button>
          <button role="menuitem" type="button" className={item} disabled={!!ocupado} onClick={porWhatsApp}>
            {ocupado === "whatsapp" ? "Abrindo…" : "Compartilhar por WhatsApp"}
          </button>
          {carro.linkPublico ? (
            <a role="menuitem" href={carro.linkPublico} target="_blank" rel="noreferrer" className={item} onClick={fechar}>
              Ver no site
            </a>
          ) : (
            <button role="menuitem" type="button" className={item} disabled title="A vitrine está desligada ou o carro está fora dela">
              Ver no site
            </button>
          )}
          {separador}
          <button role="menuitem" type="button" className={item} disabled={!!ocupado} onClick={copiarDescritivo}>
            {ocupado === "descritivo" ? "Copiando…" : "Copiar descritivo"}
          </button>
          <button role="menuitem" type="button" className={item} disabled={!!ocupado} onClick={baixarFotos}>
            {ocupado === "fotos" ? "Baixando fotos…" : `Baixar fotos${carro.totalFotos ? ` (${carro.totalFotos})` : ""}`}
          </button>
          <button
            role="menuitem"
            type="button"
            className={item}
            disabled={!carro.linkPublico}
            onClick={() => {
              setModal("qr");
              fechar();
            }}
          >
            QR Code do anúncio
          </button>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setModal("acessos");
              fechar();
            }}
          >
            Gráfico de acessos
          </button>
          {portaisAtivos.length > 0 && (
            <>
              {separador}
              <button role="menuitem" type="button" className={`${item} ${confirmaTirar ? "bg-red-500/10 font-medium text-red-600 hover:bg-red-500/10" : "text-red-600"}`} disabled={!!ocupado} onClick={() => (confirmaTirar ? tirarDeTodos() : setConfirmaTirar(true))}>
                {ocupado === "tirar" ? "Tirando…" : confirmaTirar ? `Confirmar: tirar de ${portaisAtivos.length} portal(is)` : "Tirar de todos os portais"}
              </button>
            </>
          )}
        </div>
      )}
      {modal === "qr" && carro.linkPublico && <ModalQr nome={carro.nome} placa={carro.placa} link={carro.linkPublico} aoFechar={() => setModal(null)} />}
      {modal === "acessos" && <ModalAcessos carro={carro} aoFechar={() => setModal(null)} />}
    </>
  );
}

function Moldura({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="w-full max-w-md rounded-xl bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold leading-tight">{titulo}</h3>
          <button type="button" onClick={aoFechar} className="rounded px-2 text-neutral-500 hover:bg-neutral-100" aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalQr({ nome, placa, link, aoFechar }: { nome: string; placa: string | null; link: string; aoFechar: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(link, { width: 520, margin: 2, errorCorrectionLevel: "M" }).then(setImg, () => setImg(null));
  }, [link]);
  return (
    <Moldura titulo={`QR Code: ${nome}`} aoFechar={aoFechar}>
      <div className="flex flex-col items-center gap-3">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={`QR Code do anúncio de ${nome}`} className="h-64 w-64" />
        ) : (
          <p className="py-16 text-sm text-neutral-500">Gerando…</p>
        )}
        <p className="break-all text-center text-xs text-neutral-500">{link}</p>
        {img && (
          <a href={img} download={`qrcode-${(placa ?? "carro").replace(/[^A-Za-z0-9]/g, "")}.png`} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Baixar o QR Code
          </a>
        )}
      </div>
    </Moldura>
  );
}

type Acessos = { dias: number; serie: { dia: string; visitas: number; whatsapp: number; formularios: number }[]; total: { visitas: number; whatsapp: number; formularios: number } };

function ModalAcessos({ carro, aoFechar }: { carro: CarroDaGrade; aoFechar: () => void }) {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<Acessos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setDados(null);
    setErro(null);
    fetch(`/api/veiculos/${carro.id}/acessos?dias=${dias}`).then(
      async (r) => (r.ok ? setDados((await r.json()) as Acessos) : setErro(await erroDaResposta(r))),
      () => setErro("Não consegui carregar."),
    );
  }, [carro.id, dias]);
  const maior = Math.max(1, ...(dados?.serie.map((s) => s.visitas) ?? [1]));
  return (
    <Moldura titulo={`Acessos: ${carro.nome}`} aoFechar={aoFechar}>
      <div className="mb-3 flex gap-1 text-xs">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDias(d)} aria-pressed={dias === d} className={`rounded-full px-3 py-1 ${dias === d ? "bg-accent/10 font-medium text-accent" : "text-neutral-500 hover:bg-neutral-100"}`}>
            {d} dias
          </button>
        ))}
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!dados && !erro && <p className="py-10 text-center text-sm text-neutral-500">Carregando…</p>}
      {dados && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([["Visitas", dados.total.visitas], ["WhatsApp", dados.total.whatsapp], ["Formulários", dados.total.formularios]] as const).map(([r, n]) => (
              <div key={r} className="rounded-lg bg-neutral-50 p-2">
                <p className="text-xl font-bold tabular-nums">{n}</p>
                <p className="text-[11px] text-neutral-500">{r}</p>
              </div>
            ))}
          </div>
          <svg viewBox={`0 0 ${dados.serie.length * 6} 70`} className="mt-3 h-24 w-full" role="img" aria-label={`Visitas por dia nos últimos ${dados.dias} dias`} preserveAspectRatio="none">
            {dados.serie.map((s, i) => {
              const h = (s.visitas / maior) * 64;
              return (
                <rect key={s.dia} x={i * 6 + 1} y={68 - h} width={4} height={Math.max(h, s.visitas > 0 ? 1 : 0)} rx={1} className="fill-accent">
                  <title>{`${s.dia.split("-").reverse().join("/")}: ${s.visitas} visita(s), ${s.whatsapp} no WhatsApp`}</title>
                </rect>
              );
            })}
            <line x1="0" x2={dados.serie.length * 6} y1="68.5" y2="68.5" className="stroke-neutral-200" strokeWidth="0.5" />
          </svg>
          <p className="mt-1 text-[11px] text-neutral-500">Visitas por dia na vitrine do Zap (não inclui os portais).</p>
          {dados.total.visitas === 0 && <p className="mt-2 text-xs text-neutral-500">Nenhuma visita registrada no período. {carro.linkPublico ? "" : "A vitrine está desligada ou o carro está fora dela."}</p>}
        </>
      )}
    </Moldura>
  );
}
