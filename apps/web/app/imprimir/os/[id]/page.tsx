import { notFound, redirect } from "next/navigation";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { recursosDoUsuario } from "@/lib/plano";
import { centsToBRL } from "@/lib/billing";
import { montarEndereco } from "@/lib/cadastro-cliente";
import { telefoneConhecido } from "@/lib/contact";
import {
  formatarDioptria,
  formatarEixo,
  formatarMilimetros,
  normalizarGraus,
  numeroOS,
  saldoCents,
  temPerto,
  type Graus,
  type Olho,
} from "@/lib/otica-regras";
import { BotaoImprimir } from "./botao-imprimir";

/**
 * As três folhas que a ótica preenchia à mão, agora saindo do sistema:
 *   - loja: a OS com a via do cliente (o talão numerado)
 *   - montador: a ficha que vai presa ao óculos na bancada
 *   - laboratorio: o pedido da lente, no formato que o laboratório lê
 *
 * Fora do layout do painel (sem menu lateral) para imprimir limpo.
 */
export default async function ImprimirOSPage({ params, searchParams }: { params: { id: string }; searchParams: { via?: string } }) {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("OTICA")) redirect("/painel");

  const os = await prisma.ordemServico.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      contact: true,
      receita: true,
      laboratorio: true,
      consultor: { select: { name: true } },
      tenant: { select: { name: true, timezone: true } },
    },
  });
  if (!os) notFound();

  const tz = os.tenant.timezone;
  const dia = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR", { timeZone: tz }) : "");
  const diaHora = (d: Date | null) => {
    if (!d) return "";
    const h = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
    return h === "00:00" ? dia(d) : `${dia(d)} a partir das ${h}`;
  };
  const graus = normalizarGraus(os.receita?.graus);
  const medidas = (os.medidas ?? {}) as Record<string, number | null>;
  const via = searchParams.via === "montador" || searchParams.via === "laboratorio" ? searchParams.via : "loja";
  const telefone = telefoneConhecido(os.contact);
  const nome = os.contact.name ?? os.contact.waName ?? "";
  const saldo = os.quitadaEm ? 0 : saldoCents(os.valorCents, os.sinalCents);
  const lente = [os.lentes, os.materialLente, os.indiceLente].filter(Boolean).join(" · ");
  const tratamento = [...os.tratamentos, os.tratamentoCor].filter(Boolean).join(" · ");
  const armacao = [os.armacao, os.materialArmacao].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-white text-black print:min-h-0">
      <BotaoImprimir />
      <div className="mx-auto max-w-[800px] p-6 text-[12px] leading-snug print:p-0">
        {via === "loja" && (
          <>
            <Cabecalho titulo={`O.S. Nº ${numeroOS(os.numero)}`} loja={os.tenant.name} direita={[os.laboratorio ? `Lab.: ${os.laboratorio.nome}` : "", os.pedidoLaboratorio ? `Pedido: ${os.pedidoLaboratorio}` : ""]} />
            <Bloco>
              <Linha itens={[["Cliente", nome]]} />
              <Linha itens={[["CPF", os.contact.documento], ["RG", os.contact.rgIe], ["Nasc.", dia(os.contact.nascimento)]]} />
              <Linha itens={[["End.", montarEndereco(os.contact) ?? os.contact.endereco]]} />
              <Linha itens={[["Tel.", telefone], ["E-mail", os.contact.email]]} />
              <Linha itens={[["Usuário", os.receita?.usuarioNome || "o mesmo"], ["Nasc.", dia(os.receita?.usuarioNascimento)]]} />
              <Linha itens={[["Médico", os.receita?.medico], ["CRM", os.receita?.crm], ["Consulta", dia(os.receita?.dataConsulta)]]} />
              <Linha itens={[["Emissão", dia(os.createdAt)], ["Para o dia", diaHora(os.previsaoEntrega)], ["Consultor", os.consultor?.name]]} />
            </Bloco>
            <Bloco>
              <Linha itens={[["Lentes", lente], ["Tratamento/cor", tratamento]]} />
              <Linha itens={[["Armação", armacao]]} />
            </Bloco>
            <TabelaGraus graus={graus} colunas={["esferico", "cilindrico", "eixo", "dnp", "altura"]} adicao />
            <Medidas medidas={medidas} />
            <Bloco>
              <Linha itens={[["Valor final", centsToBRL(os.valorCents)], ["Sinal", centsToBRL(os.sinalCents)], ["Saldo a receber", os.quitadaEm ? "Pago" : centsToBRL(saldo)]]} />
              <Linha itens={[["Autorizo a retirada pelo portador", os.portadorAutorizado || "não"]]} />
              {os.observacoes && <Linha itens={[["Obs.", os.observacoes]]} />}
            </Bloco>
            <p className="mt-3 text-[10px] text-neutral-700">
              Após a encomenda, não é admitido cancelamento por desistência, uma vez que as lentes são confeccionadas sob medida para cada cliente e
              não podem ser reaproveitadas. É respeitada a garantia legal do Código de Defesa do Consumidor, restrita à qualidade do produto, não
              cobrindo mau uso.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-8">
              <p className="border-t border-black pt-1 text-center">Assinatura do cliente</p>
              <p className="border-t border-black pt-1 text-center">{os.tenant.name}</p>
            </div>
            <div className="my-6 border-t border-dashed border-neutral-500" />
            <Cabecalho titulo={`Via do cliente · O.S. Nº ${numeroOS(os.numero)}`} loja={os.tenant.name} direita={[]} />
            <Bloco>
              <Linha itens={[["Cliente", nome]]} />
              <Linha itens={[["Compra", dia(os.createdAt)], ["Entrega", diaHora(os.previsaoEntrega)]]} />
              <Linha itens={[["Produto", [lente, armacao].filter(Boolean).join(" + ")]]} />
              <Linha itens={[["Valor", centsToBRL(os.valorCents)], ["Sinal", centsToBRL(os.sinalCents)], ["A receber", os.quitadaEm ? "Pago" : centsToBRL(saldo)]]} />
            </Bloco>
          </>
        )}

        {via === "montador" && (
          <>
            <Cabecalho titulo={`Montador · O.S. Nº ${numeroOS(os.numero)}`} loja={os.tenant.name} direita={[nome]} />
            <TabelaGraus graus={graus} colunas={["esferico", "cilindrico", "eixo", "dnp", "altura"]} adicao grande />
            <Bloco>
              <Linha itens={[["Lentes", [lente, tratamento].filter(Boolean).join(" · ")]]} />
              <Linha itens={[["Armação", armacao]]} />
              {os.observacoes && <Linha itens={[["Obs.", os.observacoes]]} />}
              <Linha itens={[["Data saída", dia(new Date())], ["Prev. entrega", diaHora(os.previsaoEntrega)]]} />
            </Bloco>
            <Medidas medidas={medidas} />
          </>
        )}

        {via === "laboratorio" && (
          <>
            <Cabecalho titulo="Ordem de serviço ao laboratório" loja={os.laboratorio?.nome ?? "Laboratório"} direita={[`Ótica: ${os.tenant.name}`, `Referência: OS ${numeroOS(os.numero)}`]} />
            <Bloco>
              <Linha itens={[["Data", dia(new Date())], ["Previsão", dia(os.previsaoEntrega)], ["Pedido", os.pedidoLaboratorio]]} />
              <Linha itens={[["Lentes", lente]]} />
              <Linha itens={[["Tratamento/cor", tratamento]]} />
              <Linha itens={[["Serviços", os.servicos.join(" · ")]]} />
            </Bloco>
            <TabelaGraus graus={graus} colunas={["esferico", "cilindrico", "eixo", "dnp", "altura"]} adicao />
            <Bloco>
              <Linha itens={[["Médico", os.receita?.medico], ["CRM", os.receita?.crm]]} />
              <Linha itens={[["Armação", armacao]]} />
            </Bloco>
            <Medidas medidas={medidas} />
            {os.observacoes && <Bloco><Linha itens={[["Observações", os.observacoes]]} /></Bloco>}
          </>
        )}
      </div>
    </div>
  );
}

function Cabecalho({ titulo, loja, direita }: { titulo: string; loja: string; direita: (string | null)[] }) {
  return (
    <header className="mb-2 flex items-end justify-between gap-4 border-b-2 border-black pb-1">
      <div>
        <p className="text-[11px] uppercase tracking-wide">{loja}</p>
        <h1 className="text-lg font-bold">{titulo}</h1>
      </div>
      <div className="text-right text-[11px]">{direita.filter(Boolean).map((d) => <p key={d}>{d}</p>)}</div>
    </header>
  );
}

function Bloco({ children }: { children: React.ReactNode }) {
  return <section className="mt-2 flex flex-col gap-1 border border-black p-2">{children}</section>;
}

function Linha({ itens }: { itens: [string, string | null | undefined][] }) {
  return (
    <div className="flex flex-wrap gap-x-6">
      {itens.map(([r, v]) => (
        <p key={r} className="min-w-0">
          <span className="font-semibold">{r}:</span> {v || "—"}
        </p>
      ))}
    </div>
  );
}

const ROTULO_COLUNA: Record<keyof Olho, string> = { esferico: "Esférico", cilindrico: "Cilíndrico", eixo: "Eixo", dnp: "DNP", altura: "Altura" };

function TabelaGraus({ graus, colunas, adicao, grande }: { graus: Graus; colunas: (keyof Olho)[]; adicao?: boolean; grande?: boolean }) {
  const fmt = (k: keyof Olho, v: number | null) =>
    k === "eixo" ? formatarEixo(v) : k === "dnp" || k === "altura" ? formatarMilimetros(v) : formatarDioptria(v);
  const distancias = temPerto(graus) ? (["longe", "perto"] as const) : (["longe"] as const);
  const cel = `border border-black px-2 ${grande ? "py-2 text-[14px]" : "py-1"} text-center tabular-nums`;
  return (
    <table className="mt-2 w-full border-collapse">
      <thead>
        <tr>
          <th className={cel} />
          {colunas.map((c) => <th key={c} className={cel}>{ROTULO_COLUNA[c]}</th>)}
          {adicao && <th className={cel}>Adição</th>}
        </tr>
      </thead>
      <tbody>
        {distancias.map((d) =>
          (["od", "oe"] as const).map((o) => (
            <tr key={`${d}-${o}`}>
              <th className={`${cel} text-left whitespace-nowrap`}>{d === "longe" ? "Longe" : "Perto"} {o.toUpperCase()}</th>
              {colunas.map((c) => <td key={c} className={cel}>{fmt(c, graus[d][o][c])}</td>)}
              {adicao && <td className={cel}>{d === "longe" ? formatarDioptria(graus.adicao[o]) : ""}</td>}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function Medidas({ medidas }: { medidas: Record<string, number | null> }) {
  const m = (k: string) => formatarMilimetros(typeof medidas[k] === "number" ? (medidas[k] as number) : null);
  if (!["ponte", "diagonal", "horizontal", "vertical"].some((k) => typeof medidas[k] === "number")) return null;
  return (
    <Bloco>
      <Linha itens={[["Ponte", m("ponte")], ["Maior diagonal", m("diagonal")], ["Horizontal (A)", m("horizontal")], ["Vertical (B)", m("vertical")]]} />
    </Bloco>
  );
}
