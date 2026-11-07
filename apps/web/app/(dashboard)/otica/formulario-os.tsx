"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { reaisParaCentavos } from "../funil/tipos";
import {
  ETAPAS_DO_QUADRO,
  ROTULO_ETAPA,
  alertasDaReceita,
  diaHoraNoFuso,
  formatarDioptria,
  formatarMilimetros,
  grausVazios,
  lerDioptria,
  lerEixo,
  lerMilimetros,
  normalizarGraus,
  numeroOS,
  previsaoPeloPrazo,
  saldoCents,
  type Etapa,
  type Graus,
} from "@/lib/otica-regras";
import { diaParaISO, erroDaResposta, fetcher, isoParaDia } from "./formatos";

// Opções do talão da Visuallis. Texto livre por baixo: aparecendo outro
// material, a atendente escreve em "Lentes" sem esperar uma versão nova.
const MATERIAIS_LENTE = ["Resina", "Policarbonato", "Trivex", "Cristal"];
const INDICES = ["1.50", "1.56", "1.59", "1.60", "1.67", "1.74"];
const TRATAMENTOS = ["Antirreflexo", "Antirrisco", "Fotossensível", "Filtro azul"];
const MATERIAIS_ARMACAO = ["Acetato", "Metal", "Fio de nylon", "Nylon"];
const SERVICOS = ["Montagem", "VTA", "Slim"];

type Opcoes = { laboratorios: { id: string; nome: string; prazoDias: number | null }[]; equipe: { id: string; name: string }[]; eu: string; timezone: string };
type Contato = { id: string; nome: string | null; telefone: string | null };
type ReceitaSalva = {
  id: string;
  createdAt: string;
  validaAte: string | null;
  dataConsulta: string | null;
  usuarioNome: string | null;
  usuarioNascimento: string | null;
  medico: string | null;
  crm: string | null;
  observacoes: string | null;
  graus: unknown;
};
type OSCompleta = {
  id: string;
  numero: number;
  etapa: Etapa;
  contactId: string;
  previsaoEntrega: string | null;
  laboratorioId: string | null;
  pedidoLaboratorio: string | null;
  consultorId: string | null;
  lentes: string | null;
  materialLente: string | null;
  indiceLente: string | null;
  tratamentos: string[];
  tratamentoCor: string | null;
  armacao: string | null;
  materialArmacao: string | null;
  servicos: string[];
  medidas: { ponte: number | null; diagonal: number | null; horizontal: number | null; vertical: number | null } | null;
  observacoes: string | null;
  valorCents: number;
  sinalCents: number;
  quitadaEm: string | null;
  portadorAutorizado: string | null;
  motivoCancelamento: string | null;
  contact: Record<string, string | null> & { id: string };
  receita: ReceitaSalva | null;
  eventos: { id: string; de: Etapa | null; para: Etapa; aviso: string | null; createdAt: string; por: { name: string } | null }[];
};

// A grade da receita é editada como texto ("+2,25") e lida na hora de salvar.
type Linha = { esferico: string; cilindrico: string; eixo: string; dnp: string; altura: string };
type Grade = { longe: { od: Linha; oe: Linha }; perto: { od: Linha; oe: Linha }; adicao: { od: string; oe: string } };
const linhaVazia = (): Linha => ({ esferico: "", cilindrico: "", eixo: "", dnp: "", altura: "" });

function gradeDe(g: Graus): Grade {
  const l = (o: Graus["longe"]["od"]): Linha => ({
    esferico: formatarDioptria(o.esferico),
    cilindrico: formatarDioptria(o.cilindrico),
    eixo: o.eixo === null ? "" : String(o.eixo),
    dnp: formatarMilimetros(o.dnp),
    altura: formatarMilimetros(o.altura),
  });
  return {
    longe: { od: l(g.longe.od), oe: l(g.longe.oe) },
    perto: { od: l(g.perto.od), oe: l(g.perto.oe) },
    adicao: { od: formatarDioptria(g.adicao.od), oe: formatarDioptria(g.adicao.oe) },
  };
}

/** Lê a grade digitada. Devolve os graus em inteiros ou a lista do que está errado. */
function lerGrade(g: Grade): { graus: Graus; erros: string[] } {
  const graus = grausVazios();
  const erros: string[] = [];
  const ler = (rotulo: string, r: { ok: true; valor: number | null } | { ok: false; erro: string }) => {
    if (r.ok) return r.valor;
    erros.push(`${rotulo}: ${r.erro}`);
    return null;
  };
  for (const dist of ["longe", "perto"] as const) {
    for (const olho of ["od", "oe"] as const) {
      const t = g[dist][olho];
      const rot = `${dist === "longe" ? "Longe" : "Perto"} ${olho.toUpperCase()}`;
      graus[dist][olho] = {
        esferico: ler(`${rot} esférico`, lerDioptria(t.esferico)),
        cilindrico: ler(`${rot} cilíndrico`, lerDioptria(t.cilindrico)),
        eixo: ler(`${rot} eixo`, lerEixo(t.eixo)),
        dnp: ler(`${rot} DNP`, lerMilimetros(t.dnp, 45)),
        altura: ler(`${rot} altura`, lerMilimetros(t.altura, 45)),
      };
    }
  }
  graus.adicao = { od: ler("Adição OD", lerDioptria(g.adicao.od)), oe: ler("Adição OE", lerDioptria(g.adicao.oe)) };
  return { graus, erros };
}

const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
const rotulo = "text-xs font-medium text-neutral-700";

export function FormularioOS({ id }: { id?: string }) {
  const router = useRouter();
  const editando = !!id;
  const { data: opcoes } = useSWR<Opcoes>("/api/otica/opcoes", fetcher);
  const { data: os, mutate } = useSWR<OSCompleta>(id ? `/api/otica/os/${id}` : null, fetcher);

  // Cliente
  const [contato, setContato] = useState<Contato | null>(null);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Contato[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [cliente, setCliente] = useState({ documento: "", rgIe: "", nascimento: "", email: "", cep: "", logradouro: "", numeroEndereco: "", bairro: "", cidade: "" });

  // Receita
  const [receitaId, setReceitaId] = useState<string | null>(null);
  const [grade, setGrade] = useState<Grade>(gradeDe(grausVazios()));
  const [rx, setRx] = useState({ usuarioNome: "", usuarioNascimento: "", medico: "", crm: "", dataConsulta: "", observacoes: "" });

  // Lentes, armação, laboratório e valores
  const [f, setF] = useState({
    lentes: "",
    materialLente: "",
    indiceLente: "",
    tratamentoCor: "",
    armacao: "",
    materialArmacao: "",
    laboratorioId: "",
    pedidoLaboratorio: "",
    consultorId: "",
    previsaoDia: "",
    previsaoHora: "",
    valor: "",
    sinal: "",
    portadorAutorizado: "",
    observacoes: "",
    ponte: "",
    diagonal: "",
    horizontal: "",
    vertical: "",
  });
  const [tratamentos, setTratamentos] = useState<string[]>([]);
  const [servicos, setServicos] = useState<string[]>([]);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Preenche a tela com a OS existente.
  useEffect(() => {
    if (!os) return;
    const c = os.contact;
    setContato({ id: c.id, nome: c.name, telefone: c.phoneNumber });
    setCliente({
      documento: c.documento ?? "",
      rgIe: c.rgIe ?? "",
      nascimento: isoParaDia(c.nascimento),
      email: c.email ?? "",
      cep: c.cep ?? "",
      logradouro: c.logradouro ?? "",
      numeroEndereco: c.numeroEndereco ?? "",
      bairro: c.bairro ?? "",
      cidade: c.cidade ?? "",
    });
    if (os.receita) carregarReceita(os.receita, false);
    const mm = (v: number | null | undefined) => formatarMilimetros(v ?? null);
    setF({
      lentes: os.lentes ?? "",
      materialLente: os.materialLente ?? "",
      indiceLente: os.indiceLente ?? "",
      tratamentoCor: os.tratamentoCor ?? "",
      armacao: os.armacao ?? "",
      materialArmacao: os.materialArmacao ?? "",
      laboratorioId: os.laboratorioId ?? "",
      pedidoLaboratorio: os.pedidoLaboratorio ?? "",
      consultorId: os.consultorId ?? "",
      previsaoDia: "",
      previsaoHora: "",
      valor: os.valorCents ? (os.valorCents / 100).toFixed(2).replace(".", ",") : "",
      sinal: os.sinalCents ? (os.sinalCents / 100).toFixed(2).replace(".", ",") : "",
      portadorAutorizado: os.portadorAutorizado ?? "",
      observacoes: os.observacoes ?? "",
      ponte: mm(os.medidas?.ponte),
      diagonal: mm(os.medidas?.diagonal),
      horizontal: mm(os.medidas?.horizontal),
      vertical: mm(os.medidas?.vertical),
    });
    setTratamentos(os.tratamentos);
    setServicos(os.servicos);
  }, [os?.id]);

  // A previsão aparece no relógio da loja, que só se sabe depois de carregar as opções.
  useEffect(() => {
    if (!os?.previsaoEntrega || !opcoes) return;
    const { dia, hora } = diaHoraNoFuso(new Date(os.previsaoEntrega), opcoes.timezone);
    setF((x) => ({ ...x, previsaoDia: dia, previsaoHora: hora }));
  }, [os?.id, os?.previsaoEntrega, opcoes]);

  // Consultor padrão: quem está abrindo a OS.
  useEffect(() => {
    if (!editando && opcoes && !f.consultorId) setF((x) => ({ ...x, consultorId: opcoes.eu }));
  }, [opcoes, editando, f.consultorId]);

  // Busca de cliente, esperando a pessoa parar de digitar.
  useEffect(() => {
    if (contato || busca.trim().length < 2) {
      setAchados([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/negociacoes/contatos?q=${encodeURIComponent(busca.trim())}`);
      if (r.ok) setAchados(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [busca, contato]);

  // Ao escolher o cliente numa OS nova: traz a ficha dele e as receitas anteriores.
  const { data: receitasDoCliente } = useSWR<ReceitaSalva[]>(
    !editando && contato ? `/api/otica/receitas?contactId=${contato.id}` : null,
    fetcher
  );
  async function escolherContato(c: Contato) {
    setContato(c);
    setBusca("");
    const r = await fetch(`/api/contacts/${c.id}`);
    if (!r.ok) return;
    const d = await r.json();
    setCliente({
      documento: d.documento ?? "",
      rgIe: d.rgIe ?? "",
      nascimento: isoParaDia(d.nascimento),
      email: d.email ?? "",
      cep: d.cep ?? "",
      logradouro: d.logradouro ?? "",
      numeroEndereco: d.numeroEndereco ?? "",
      bairro: d.bairro ?? "",
      cidade: d.cidade ?? "",
    });
  }

  function carregarReceita(r: ReceitaSalva, reaproveitar: boolean) {
    setGrade(gradeDe(normalizarGraus(r.graus)));
    setRx({
      usuarioNome: r.usuarioNome ?? "",
      usuarioNascimento: isoParaDia(r.usuarioNascimento),
      medico: r.medico ?? "",
      crm: r.crm ?? "",
      dataConsulta: isoParaDia(r.dataConsulta),
      observacoes: r.observacoes ?? "",
    });
    setReceitaId(reaproveitar ? r.id : null);
  }

  // Qualquer mudança na receita reaproveitada vira uma receita nova.
  const mudarGrade = (dist: "longe" | "perto", olho: "od" | "oe", k: keyof Linha, v: string) => {
    setReceitaId(null);
    setGrade((g) => ({ ...g, [dist]: { ...g[dist], [olho]: { ...g[dist][olho], [k]: v } } }));
  };
  const mudarRx = (k: keyof typeof rx, v: string) => {
    setReceitaId(null);
    setRx((x) => ({ ...x, [k]: v }));
  };

  // Laboratório escolhido sem previsão: sugere pelo prazo dele.
  function escolherLab(labId: string) {
    setF((x) => {
      const lab = opcoes?.laboratorios.find((l) => l.id === labId);
      if (!lab?.prazoDias || x.previsaoDia) return { ...x, laboratorioId: labId };
      const p = previsaoPeloPrazo(new Date(), lab.prazoDias);
      return { ...x, laboratorioId: labId, previsaoDia: diaHoraNoFuso(p, opcoes!.timezone).dia };
    });
  }

  const lida = useMemo(() => lerGrade(grade), [grade]);
  const alertas = useMemo(() => (lida.erros.length ? [] : alertasDaReceita(lida.graus)), [lida]);
  const valorCents = reaisParaCentavos(f.valor);
  const sinalCents = reaisParaCentavos(f.sinal);
  const saldo = valorCents !== null && sinalCents !== null ? saldoCents(valorCents, sinalCents) : null;
  const receitaPreenchida = JSON.stringify(lida.graus) !== JSON.stringify(grausVazios()) || Object.values(rx).some(Boolean);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(null);
    if (!contato && !editando && !(novoNome.trim() && novoTelefone.trim())) return setErro("Escolha o cliente ou cadastre pelo nome e telefone.");
    if (lida.erros.length) return setErro(`Confira a receita: ${lida.erros.join(" · ")}`);
    if (valorCents === null || sinalCents === null) return setErro("Confira o valor e o sinal.");
    if (sinalCents > valorCents) return setErro("O sinal não pode ser maior que o valor.");
    const medidas = {
      ponte: lerMilimetros(f.ponte),
      diagonal: lerMilimetros(f.diagonal),
      horizontal: lerMilimetros(f.horizontal),
      vertical: lerMilimetros(f.vertical),
    };
    const errosMedidas = Object.entries(medidas).flatMap(([k, r]) => (r.ok ? [] : [`${k}: ${r.erro}`]));
    if (errosMedidas.length) return setErro(`Confira as medidas: ${errosMedidas.join(" · ")}`);
    const val = (r: { ok: true; valor: number | null } | { ok: false }) => (r.ok ? r.valor : null);

    // Dados do cliente: numa OS nova, só o que foi preenchido (vazio não
    // apaga o que já estava na ficha); na edição, a tela mostra a ficha
    // inteira, então o que está aqui é o que vale.
    const dadosCliente = Object.fromEntries(
      Object.entries(cliente)
        .filter(([, v]) => editando || v.trim())
        .map(([k, v]) => [k, k === "nascimento" ? diaParaISO(v) : v.trim() || null])
    );

    const corpo = {
      ...(editando ? {} : contato ? { contactId: contato.id } : { novoCliente: { nome: novoNome.trim(), telefone: novoTelefone } }),
      cliente: dadosCliente,
      ...(receitaId
        ? { receitaId }
        : receitaPreenchida
          ? {
              receita: {
                usuarioNome: rx.usuarioNome || null,
                usuarioNascimento: diaParaISO(rx.usuarioNascimento),
                medico: rx.medico || null,
                crm: rx.crm || null,
                dataConsulta: diaParaISO(rx.dataConsulta),
                graus: lida.graus,
                observacoes: rx.observacoes || null,
              },
            }
          : {}),
      laboratorioId: f.laboratorioId || null,
      pedidoLaboratorio: f.pedidoLaboratorio,
      consultorId: f.consultorId || null,
      previsao: f.previsaoDia ? { dia: f.previsaoDia, hora: f.previsaoHora } : null,
      lentes: f.lentes,
      materialLente: f.materialLente,
      indiceLente: f.indiceLente,
      tratamentos,
      tratamentoCor: f.tratamentoCor,
      armacao: f.armacao,
      materialArmacao: f.materialArmacao,
      servicos,
      medidas: { ponte: val(medidas.ponte), diagonal: val(medidas.diagonal), horizontal: val(medidas.horizontal), vertical: val(medidas.vertical) },
      observacoes: f.observacoes,
      valorCents,
      sinalCents,
      portadorAutorizado: f.portadorAutorizado,
    };

    setSalvando(true);
    const r = await fetch(editando ? `/api/otica/os/${id}` : "/api/otica/os", {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setSalvando(false);
    if (!r.ok) return setErro(await erroDaResposta(r));
    if (editando) {
      setOk("Alterações salvas.");
      mutate();
    } else {
      const criada = (await r.json()) as { id: string; numero: number };
      router.push(`/otica/os/${criada.id}`);
    }
  }

  if (editando && !os) return <p className="text-sm text-neutral-500">Carregando OS…</p>;
  const cancelada = os?.etapa === "CANCELADA";

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/otica" className="text-xs text-neutral-500 hover:text-accent">← Ordens de serviço</Link>
          <h2 className="text-xl font-semibold">{os ? `OS ${numeroOS(os.numero)}` : "Nova ordem de serviço"}</h2>
        </div>
        {os && (
          <div className="flex flex-wrap gap-2 text-sm">
            <a href={`/imprimir/os/${os.id}?via=loja`} target="_blank" className="rounded-md border border-neutral-300 px-3 py-1.5 hover:border-accent">Imprimir OS</a>
            <a href={`/imprimir/os/${os.id}?via=montador`} target="_blank" className="rounded-md border border-neutral-300 px-3 py-1.5 hover:border-accent">Ficha do montador</a>
            <a href={`/imprimir/os/${os.id}?via=laboratorio`} target="_blank" className="rounded-md border border-neutral-300 px-3 py-1.5 hover:border-accent">Pedido ao laboratório</a>
          </div>
        )}
      </div>

      {os && <BarraEtapas os={os} aoMudar={() => mutate()} />}

      <form onSubmit={salvar} className="flex flex-col gap-4">
        <fieldset disabled={cancelada} className="flex flex-col gap-4 disabled:opacity-70">
          <Secao titulo="Cliente">
            {contato ? (
              <div className="flex items-center justify-between rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <span>
                  <b>{contato.nome || "Sem nome"}</b> <span className="text-neutral-500">{contato.telefone}</span>
                </span>
                {!editando && (
                  <button type="button" onClick={() => { setContato(null); setReceitaId(null); }} className="text-xs text-accent hover:underline">Trocar</button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input id="os-busca-cliente" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente por nome, telefone ou CPF" className={campo} />
                {achados.length > 0 && (
                  <ul className="rounded-md border border-neutral-200 divide-y divide-neutral-100 max-h-48 overflow-y-auto">
                    {achados.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => escolherContato(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50">
                          {c.nome || "Sem nome"} <span className="text-xs text-neutral-400">{c.telefone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-neutral-500">Cliente novo? Preencha nome e WhatsApp:</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  <input id="os-novo-nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome completo" className={campo} />
                  <input id="os-novo-tel" value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)} placeholder="WhatsApp com DDD" inputMode="tel" className={campo} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Campo rotulo="CPF" id="os-cpf" valor={cliente.documento} mudar={(v) => setCliente({ ...cliente, documento: v })} />
              <Campo rotulo="RG" id="os-rg" valor={cliente.rgIe} mudar={(v) => setCliente({ ...cliente, rgIe: v })} />
              <Campo rotulo="Nascimento" id="os-nasc" tipo="date" valor={cliente.nascimento} mudar={(v) => setCliente({ ...cliente, nascimento: v })} />
              <Campo rotulo="E-mail" id="os-email" valor={cliente.email} mudar={(v) => setCliente({ ...cliente, email: v })} />
              <Campo rotulo="Endereço" id="os-logradouro" valor={cliente.logradouro} mudar={(v) => setCliente({ ...cliente, logradouro: v })} className="col-span-2" />
              <Campo rotulo="Número" id="os-numero" valor={cliente.numeroEndereco} mudar={(v) => setCliente({ ...cliente, numeroEndereco: v })} />
              <Campo rotulo="CEP" id="os-cep" valor={cliente.cep} mudar={(v) => setCliente({ ...cliente, cep: v })} />
              <Campo rotulo="Bairro" id="os-bairro" valor={cliente.bairro} mudar={(v) => setCliente({ ...cliente, bairro: v })} className="col-span-2" />
              <Campo rotulo="Cidade" id="os-cidade" valor={cliente.cidade} mudar={(v) => setCliente({ ...cliente, cidade: v })} className="col-span-2" />
            </div>
          </Secao>

          <Secao titulo="Receita">
            {!editando && receitasDoCliente && receitasDoCliente.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-neutral-500">Receitas anteriores:</span>
                {receitasDoCliente.map((r) => {
                  const vencida = r.validaAte && new Date(r.validaAte) < new Date();
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => carregarReceita(r, true)}
                      className={`rounded-full border px-3 py-1 ${receitaId === r.id ? "border-accent bg-accent/10 text-accent" : "border-neutral-300 hover:border-accent"}`}
                    >
                      {new Date(r.dataConsulta ?? r.createdAt).toLocaleDateString("pt-BR")}
                      {vencida ? " · vencida" : ""}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Campo rotulo="Quem usa (se não for o cliente)" id="rx-usuario" valor={rx.usuarioNome} mudar={(v) => mudarRx("usuarioNome", v)} className="col-span-2" />
              <Campo rotulo="Nascimento de quem usa" id="rx-usuario-nasc" tipo="date" valor={rx.usuarioNascimento} mudar={(v) => mudarRx("usuarioNascimento", v)} />
              <Campo rotulo="Data da consulta" id="rx-consulta" tipo="date" valor={rx.dataConsulta} mudar={(v) => mudarRx("dataConsulta", v)} />
              <Campo rotulo="Médico" id="rx-medico" valor={rx.medico} mudar={(v) => mudarRx("medico", v)} className="col-span-2" />
              <Campo rotulo="CRM" id="rx-crm" valor={rx.crm} mudar={(v) => mudarRx("crm", v)} />
            </div>
            <GradeReceita grade={grade} mudar={mudarGrade} mudarAdicao={(olho, v) => { setReceitaId(null); setGrade((g) => ({ ...g, adicao: { ...g.adicao, [olho]: v } })); }} />
            {lida.erros.length > 0 && <p className="text-xs text-red-600">{lida.erros.join(" · ")}</p>}
            {alertas.length > 0 && <p className="text-xs text-amber-700">Confira: {alertas.join(" · ")}</p>}
            <Campo rotulo="Observações da receita" id="rx-obs" valor={rx.observacoes} mudar={(v) => mudarRx("observacoes", v)} />
          </Secao>

          <Secao titulo="Lentes e armação">
            <Campo rotulo="Lentes" id="os-lentes" valor={f.lentes} mudar={(v) => setF({ ...f, lentes: v })} dica="ex.: Multifocal digital, monofocal" />
            <Escolha rotulo="Material da lente" opcoes={MATERIAIS_LENTE} valor={f.materialLente} mudar={(v) => setF({ ...f, materialLente: v })} />
            <Escolha rotulo="Índice" opcoes={INDICES} valor={f.indiceLente} mudar={(v) => setF({ ...f, indiceLente: v })} />
            <Varias rotulo="Tratamentos" opcoes={TRATAMENTOS} valores={tratamentos} mudar={setTratamentos} />
            <Campo rotulo="Tratamento / cor" id="os-cor" valor={f.tratamentoCor} mudar={(v) => setF({ ...f, tratamentoCor: v })} />
            <Campo rotulo="Armação" id="os-armacao" valor={f.armacao} mudar={(v) => setF({ ...f, armacao: v })} dica="Modelo, cor e código. ex.: Armação preta 3R9237 C4 52□19-145" />
            <Escolha rotulo="Material da armação" opcoes={MATERIAIS_ARMACAO} valor={f.materialArmacao} mudar={(v) => setF({ ...f, materialArmacao: v })} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Campo rotulo="Ponte (mm)" id="os-ponte" valor={f.ponte} mudar={(v) => setF({ ...f, ponte: v })} />
              <Campo rotulo="Maior diagonal (mm)" id="os-md" valor={f.diagonal} mudar={(v) => setF({ ...f, diagonal: v })} />
              <Campo rotulo="Horizontal A (mm)" id="os-a" valor={f.horizontal} mudar={(v) => setF({ ...f, horizontal: v })} />
              <Campo rotulo="Vertical B (mm)" id="os-b" valor={f.vertical} mudar={(v) => setF({ ...f, vertical: v })} />
            </div>
            <Varias rotulo="Serviços no laboratório" opcoes={SERVICOS} valores={servicos} mudar={setServicos} />
          </Secao>

          <Secao titulo="Laboratório e entrega">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className={`${rotulo} col-span-2`}>
                Laboratório
                <select id="os-lab" value={f.laboratorioId} onChange={(e) => escolherLab(e.target.value)} className={`${campo} mt-1`}>
                  <option value="">—</option>
                  {opcoes?.laboratorios.map((l) => (
                    <option key={l.id} value={l.id}>{l.nome}{l.prazoDias ? ` (${l.prazoDias} dias)` : ""}</option>
                  ))}
                </select>
              </label>
              <Campo rotulo="Nº do pedido no laboratório" id="os-pedido" valor={f.pedidoLaboratorio} mudar={(v) => setF({ ...f, pedidoLaboratorio: v })} className="col-span-2" />
              <Campo rotulo="Previsão de entrega" id="os-prev-dia" tipo="date" valor={f.previsaoDia} mudar={(v) => setF({ ...f, previsaoDia: v })} />
              <Campo rotulo="A partir das" id="os-prev-hora" tipo="time" valor={f.previsaoHora} mudar={(v) => setF({ ...f, previsaoHora: v })} />
              <label className={`${rotulo} col-span-2`}>
                Consultor
                <select id="os-consultor" value={f.consultorId} onChange={(e) => setF({ ...f, consultorId: e.target.value })} className={`${campo} mt-1`}>
                  <option value="">—</option>
                  {opcoes?.equipe.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
            </div>
            {opcoes && opcoes.laboratorios.length === 0 && (
              <p className="text-xs text-neutral-500">Nenhum laboratório cadastrado. A gestão cadastra em Ótica → Laboratórios e avisos.</p>
            )}
          </Secao>

          <Secao titulo="Valores">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <Campo rotulo="Valor final (R$)" id="os-valor" valor={f.valor} mudar={(v) => setF({ ...f, valor: v })} modo="decimal" />
              <Campo rotulo="Sinal (R$)" id="os-sinal" valor={f.sinal} mudar={(v) => setF({ ...f, sinal: v })} modo="decimal" />
              <div className="text-sm">
                <span className={rotulo}>Saldo a receber</span>
                <p className="py-2 font-semibold tabular-nums">{os?.quitadaEm ? "Quitada" : saldo === null ? "—" : centsToBRL(saldo)}</p>
              </div>
              {os && saldo !== null && saldo > 0 && <BotaoQuitar os={os} aoMudar={() => mutate()} />}
            </div>
            <Campo rotulo="Autorizado a retirar (além do cliente)" id="os-portador" valor={f.portadorAutorizado} mudar={(v) => setF({ ...f, portadorAutorizado: v })} />
          </Secao>

          <Secao titulo="Observações">
            <textarea id="os-obs" value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} rows={3} className={campo} />
          </Secao>
        </fieldset>

        {erro && <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">{erro}</p>}
        {ok && <p role="status" className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{ok}</p>}
        {!cancelada && (
          <div className="flex gap-2">
            <button disabled={salvando} className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Abrir OS"}
            </button>
            <Link href="/otica" className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm">Voltar</Link>
          </div>
        )}
      </form>

      {os && <Historico eventos={os.eventos} />}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-surface p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

function Campo(p: { rotulo: string; id: string; valor: string; mudar: (v: string) => void; tipo?: string; className?: string; dica?: string; modo?: "decimal" | "text" }) {
  return (
    <label className={`${rotulo} ${p.className ?? ""}`}>
      {p.rotulo}
      <input id={p.id} type={p.tipo ?? "text"} value={p.valor} onChange={(e) => p.mudar(e.target.value)} inputMode={p.modo} placeholder={p.dica} className={`${campo} mt-1`} />
    </label>
  );
}

function Escolha({ rotulo: r, opcoes, valor, mudar }: { rotulo: string; opcoes: string[]; valor: string; mudar: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={rotulo}>{r}</span>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => (
          <button key={o} type="button" aria-pressed={valor === o} onClick={() => mudar(valor === o ? "" : o)}
            className={`rounded-full border px-3 py-1 text-xs ${valor === o ? "border-accent bg-accent text-white" : "border-neutral-300 hover:border-accent"}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Varias({ rotulo: r, opcoes, valores, mudar }: { rotulo: string; opcoes: string[]; valores: string[]; mudar: (v: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={rotulo}>{r}</span>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => {
          const on = valores.includes(o);
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => mudar(on ? valores.filter((v) => v !== o) : [...valores, o])}
              className={`rounded-full border px-3 py-1 text-xs ${on ? "border-accent bg-accent text-white" : "border-neutral-300 hover:border-accent"}`}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GradeReceita({ grade, mudar, mudarAdicao }: {
  grade: Grade;
  mudar: (d: "longe" | "perto", o: "od" | "oe", k: keyof Linha, v: string) => void;
  mudarAdicao: (o: "od" | "oe", v: string) => void;
}) {
  const colunas: { k: keyof Linha; rot: string; dica: string }[] = [
    { k: "esferico", rot: "Esférico", dica: "+2,00" },
    { k: "cilindrico", rot: "Cilíndrico", dica: "-0,50" },
    { k: "eixo", rot: "Eixo", dica: "180" },
    { k: "dnp", rot: "DNP", dica: "32,0" },
    { k: "altura", rot: "Altura", dica: "22,5" },
  ];
  const cel = "w-full min-w-[64px] rounded border border-neutral-300 bg-surface px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-xs text-neutral-500">
            <th className="w-20" />
            {colunas.map((c) => <th key={c.k} className="px-1 pb-1 font-medium">{c.rot}</th>)}
            <th className="px-1 pb-1 font-medium">Adição</th>
          </tr>
        </thead>
        <tbody>
          {(["longe", "perto"] as const).map((dist) =>
            (["od", "oe"] as const).map((olho) => (
              <tr key={`${dist}-${olho}`} className={olho === "od" ? "border-t border-neutral-200" : ""}>
                <th className="py-1 pr-2 text-left text-xs font-semibold whitespace-nowrap">
                  {olho === "od" ? <span className="text-neutral-500 font-normal mr-1">{dist === "longe" ? "Longe" : "Perto"}</span> : <span className="mr-1 invisible">{dist === "longe" ? "Longe" : "Perto"}</span>}
                  {olho.toUpperCase()}
                </th>
                {colunas.map((c) => (
                  <td key={c.k} className="p-0.5">
                    <input
                      id={`rx-${dist}-${olho}-${c.k}`}
                      aria-label={`${dist} ${olho.toUpperCase()} ${c.rot}`}
                      value={grade[dist][olho][c.k]}
                      onChange={(e) => mudar(dist, olho, c.k, e.target.value)}
                      placeholder={dist === "longe" && olho === "od" ? c.dica : ""}
                      inputMode="decimal"
                      className={cel}
                    />
                  </td>
                ))}
                <td className="p-0.5">
                  {dist === "longe" && (
                    <input id={`rx-adicao-${olho}`} aria-label={`Adição ${olho.toUpperCase()}`} value={grade.adicao[olho]} onChange={(e) => mudarAdicao(olho, e.target.value)} placeholder={olho === "od" ? "+2,25" : ""} inputMode="decimal" className={cel} />
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-neutral-500">Graus de 0,25 em 0,25. DNP e altura em mm (34,5 ou 345). Eixo de 0 a 180.</p>
    </div>
  );
}

function BarraEtapas({ os, aoMudar }: { os: OSCompleta; aoMudar: () => void }) {
  const [avisar, setAvisar] = useState(true);
  const [movendo, setMovendo] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function mover(para: Etapa) {
    setMovendo(true);
    setMsg(null);
    const r = await fetch(`/api/otica/os/${os.id}/etapa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ para, avisar: para === "CANCELADA" ? false : avisar, motivoCancelamento: motivo || undefined }),
    });
    setMovendo(false);
    if (!r.ok) return setMsg({ texto: await erroDaResposta(r), erro: true });
    const { aviso } = (await r.json()) as { aviso: string | null };
    setMsg({ texto: `Agora em "${ROTULO_ETAPA[para]}".${aviso === "enviado" ? " Cliente avisado pelo WhatsApp." : aviso ? ` Sem aviso: ${aviso}.` : ""}` });
    setCancelando(false);
    aoMudar();
  }

  if (os.etapa === "CANCELADA") {
    return (
      <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">
        OS cancelada{os.motivoCancelamento ? `: ${os.motivoCancelamento}` : ""}. Para refazer a venda, abra uma nova OS.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-surface p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {ETAPAS_DO_QUADRO.map((e) => (
          <button key={e} type="button" disabled={movendo || e === os.etapa} onClick={() => mover(e)}
            className={`rounded-full px-3 py-1 text-xs ${e === os.etapa ? "bg-accent text-white font-medium" : "border border-neutral-300 hover:border-accent disabled:opacity-50"}`}>
            {ROTULO_ETAPA[e]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-neutral-600">
          <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="accent-[rgb(var(--accent))]" />
          Avisar o cliente ao mudar
        </label>
      </div>
      {msg && <p role="status" className={`text-xs ${msg.erro ? "text-red-600" : "text-accent"}`}>{msg.texto}</p>}
      {cancelando ? (
        <div className="flex flex-wrap gap-2">
          <input id="os-motivo-cancel" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo do cancelamento" className={`${campo} flex-1 min-w-[200px]`} />
          <button type="button" onClick={() => mover("CANCELADA")} disabled={movendo} className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white">Confirmar cancelamento</button>
          <button type="button" onClick={() => setCancelando(false)} className="rounded-md border border-neutral-300 px-3 py-2 text-xs">Manter OS</button>
        </div>
      ) : (
        <button type="button" onClick={() => setCancelando(true)} className="self-start text-xs text-neutral-500 hover:text-red-600">Cancelar esta OS</button>
      )}
    </div>
  );
}

function BotaoQuitar({ os, aoMudar }: { os: OSCompleta; aoMudar: () => void }) {
  const [enviando, setEnviando] = useState(false);
  return (
    <button
      type="button"
      disabled={enviando}
      onClick={async () => {
        setEnviando(true);
        await fetch(`/api/otica/os/${os.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quitada: true }) });
        setEnviando(false);
        aoMudar();
      }}
      className="rounded-md border border-accent px-3 py-2 text-xs font-medium text-accent hover:bg-accent hover:text-white disabled:opacity-50"
    >
      Marcar saldo como recebido
    </button>
  );
}

function Historico({ eventos }: { eventos: OSCompleta["eventos"] }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-surface p-4">
      <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
      <ol className="flex flex-col gap-1.5 text-xs">
        {eventos.map((e) => (
          <li key={e.id} className="flex flex-wrap gap-x-2 text-neutral-600">
            <span className="tabular-nums text-neutral-400">{new Date(e.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
            <span>
              {e.de ? `${ROTULO_ETAPA[e.de]} → ${ROTULO_ETAPA[e.para]}` : "OS aberta"}
              {e.por ? ` · ${e.por.name}` : ""}
            </span>
            {e.aviso && <span className={e.aviso === "enviado" ? "text-accent" : "text-amber-700"}>{e.aviso === "enviado" ? "cliente avisado" : e.aviso}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
