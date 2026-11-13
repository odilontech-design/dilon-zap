"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FormularioOS, type Escaneada } from "../../formulario-os";
import { erroDaResposta } from "../../formatos";

type Modo = "andamento" | "historica";

/** Reduz a foto do celular (muitos MB) antes de enviar: a leitura não precisa de mais que isso e sobe bem mais rápido. */
async function reduzir(arquivo: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const lado = Math.max(bitmap.width, bitmap.height);
    const escala = Math.min(1, 2000 / lado);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
    if (!blob || blob.size >= arquivo.size) return arquivo;
    return new File([blob], "os.jpg", { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}

export function EscanearOS() {
  const [modo, setModo] = useState<Modo>("andamento");
  const [foto, setFoto] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Escaneada | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);

  useEffect(() => {
    if (!foto) return setPrevia(null);
    const u = URL.createObjectURL(foto);
    setPrevia(u);
    return () => URL.revokeObjectURL(u);
  }, [foto]);

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setResultado(null);
    setFoto(await reduzir(arquivo));
  }

  async function ler() {
    if (!foto) return;
    setErro(null);
    setLendo(true);
    const envio = new FormData();
    envio.append("foto", foto);
    const r = await fetch("/api/otica/os/ler", { method: "POST", body: envio }).catch(() => null);
    setLendo(false);
    if (!r) return setErro("Sem conexão. Tente de novo.");
    if (!r.ok) return setErro(await erroDaResposta(r));
    const j = await r.json();
    setResultado({ ...j, foto, historica: modo === "historica" });
  }

  if (resultado) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setResultado(null)} className="w-fit text-xs text-neutral-500 hover:text-accent">← Tirar outra foto</button>
        <FormularioOS escaneada={resultado} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <Link href="/otica" className="text-xs text-neutral-500 hover:text-accent">← Ordens de serviço</Link>
        <h2 className="text-xl font-semibold">Escanear OS do papel</h2>
        <p className="mt-1 text-sm text-neutral-600">Tire uma foto da OS. O sistema lê os campos, você confere e salva, e a foto fica guardada na OS.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-neutral-700">Que tipo de OS é esta?</legend>
        <label className={`flex gap-3 rounded-md border p-3 text-sm cursor-pointer ${modo === "andamento" ? "border-accent bg-accent/5" : "border-neutral-300"}`}>
          <input type="radio" name="modo" checked={modo === "andamento"} onChange={() => setModo("andamento")} className="mt-1 accent-[rgb(var(--accent))]" />
          <span>
            <b>OS em andamento</b> (escrita à mão agora)
            <span className="block text-xs text-neutral-600">Entra no quadro, o sinal entra no Caixa, o saldo fica em A receber e a armação sai do estoque. O cliente recebe os avisos pelo WhatsApp.</span>
          </span>
        </label>
        <label className={`flex gap-3 rounded-md border p-3 text-sm cursor-pointer ${modo === "historica" ? "border-accent bg-accent/5" : "border-neutral-300"}`}>
          <input type="radio" name="modo" checked={modo === "historica"} onChange={() => setModo("historica")} className="mt-1 accent-[rgb(var(--accent))]" />
          <span>
            <b>OS antiga</b> (só guardar o histórico)
            <span className="block text-xs text-neutral-600">Guarda a OS, a receita e a foto. Não mexe em Caixa, estoque nem WhatsApp, e o cliente não recebe nada.</span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => camera.current?.click()} className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white">Tirar foto</button>
          <button type="button" onClick={() => galeria.current?.click()} className="rounded-md border border-neutral-300 px-4 py-2.5 text-sm">Escolher da galeria</button>
        </div>
        <input id="escanear-camera" ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
        <input id="escanear-galeria" ref={galeria} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
        <ul className="list-disc pl-5 text-xs text-neutral-600 space-y-0.5">
          <li>Deixe a folha inteira na foto, reta, sobre uma mesa, enchendo a tela. Chegue perto: letra pequena não é lida.</li>
          <li>Boa luz, sem sombra da mão nem reflexo. Uma OS por foto.</li>
          <li>Se a foto ficar escura, torta ou com a folha pequena, tire de novo antes de ler.</li>
        </ul>
      </div>

      {previa && foto && (
        <div className="flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previa} alt="Foto da OS" className="max-h-96 w-auto max-w-full rounded-md border border-neutral-300 object-contain" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={ler} disabled={lendo} className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {lendo ? "Lendo a OS…" : "Ler a OS"}
            </button>
            <span className="text-xs text-neutral-500">{(foto.size / 1024 / 1024).toFixed(1)} MB</span>
          </div>
        </div>
      )}
      {lendo && <p role="status" className="text-sm text-neutral-600">Lendo a foto. Costuma levar uns 10 segundos.</p>}
      {erro && <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{erro}</p>}
    </div>
  );
}
