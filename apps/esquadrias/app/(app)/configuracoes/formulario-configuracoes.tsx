"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatarReais, lerCentavos } from "@dilon-zap/esquadrias-core";
import { AreaTexto, Botao, Campo, Entrada } from "@/components/campos";
import { Card, TituloPagina } from "@/components/ui";
import { enviar } from "@/lib/fetcher";

type Empresa = {
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  logoUrl: string | null;
  margemLucroPercent: number;
  maoDeObraPorM2Centavos: number;
  maoDeObraPercentSobreCusto: number;
  perdaAluminioPercent: number;
  impostoPercent: number;
  espessuraSerraMm: number;
  sobraMinimaAproveitavelMm: number;
  validadeOrcamentoDias: number;
  condicoesPadrao: string | null;
};

export function FormularioConfiguracoes({ empresa }: { empresa: Empresa }) {
  const router = useRouter();
  const [form, setForm] = useState(empresa);
  const [maoDeObra, setMaoDeObra] = useState((empresa.maoDeObraPorM2Centavos / 100).toFixed(2).replace(".", ","));
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const alterar = <K extends keyof Empresa>(campo: K, valor: Empresa[K]) => setForm((a) => ({ ...a, [campo]: valor }));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      await enviar("/api/empresa", "PATCH", {
        ...form,
        maoDeObraPorM2Centavos: lerCentavos(maoDeObra),
        logoUrl: form.logoUrl || null,
      });
      setMensagem("Configurações salvas. Vale para os PRÓXIMOS orçamentos — os já criados mantêm o preço que foi calculado.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível salvar");
    } finally {
      setSalvando(false);
    }
  }

  const numero = <K extends keyof Empresa>(campo: K, rotulo: string, ajuda?: string, passo = "0.1") => (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      <Entrada type="number" step={passo} value={String(form[campo])} onChange={(e) => alterar(campo, (Number(e.target.value) || 0) as Empresa[K])} />
    </Campo>
  );

  return (
    <>
      <TituloPagina
        titulo="Configurações"
        descricao="Os números daqui são o que torna o sistema SEU: margem, mão de obra, perda de alumínio e imposto entram em todo orçamento."
        acao={
          <Link href="/configuracoes/plano" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
            Plano e cobrança
          </Link>
        }
      />

      {mensagem && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{mensagem}</p>}
      {erro && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-medium text-neutral-900">Dados da empresa</h2>
          <p className="mb-3 text-xs text-neutral-500">Aparecem no cabeçalho da proposta que o cliente final recebe.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome" className="sm:col-span-2">
              <Entrada value={form.nome} onChange={(e) => alterar("nome", e.target.value)} />
            </Campo>
            <Campo rotulo="CNPJ">
              <Entrada value={form.cnpj ?? ""} onChange={(e) => alterar("cnpj", e.target.value)} />
            </Campo>
            <Campo rotulo="Telefone">
              <Entrada value={form.telefone ?? ""} onChange={(e) => alterar("telefone", e.target.value)} />
            </Campo>
            <Campo rotulo="Email">
              <Entrada value={form.email ?? ""} onChange={(e) => alterar("email", e.target.value)} />
            </Campo>
            <Campo rotulo="Cidade">
              <Entrada value={form.cidade ?? ""} onChange={(e) => alterar("cidade", e.target.value)} />
            </Campo>
            <Campo rotulo="Endereço" className="sm:col-span-2">
              <Entrada value={form.endereco ?? ""} onChange={(e) => alterar("endereco", e.target.value)} />
            </Campo>
            <Campo rotulo="URL do logotipo" ajuda="Usado na proposta impressa." className="sm:col-span-2">
              <Entrada value={form.logoUrl ?? ""} onChange={(e) => alterar("logoUrl", e.target.value)} placeholder="https://…" />
            </Campo>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-medium text-neutral-900">Precificação</h2>
          <p className="mb-3 text-xs text-neutral-500">
            Margem de 100% significa dobrar o custo — é a prática do setor. A perda de alumínio é o retalho que sobra da barra e
            que você paga mesmo sem usar.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {numero("margemLucroPercent", "Margem de lucro padrão (%)")}
            <Campo rotulo="Mão de obra por m²" ajuda={`Hoje: ${formatarReais(lerCentavos(maoDeObra))} por m² de esquadria.`}>
              <Entrada inputMode="decimal" value={maoDeObra} onChange={(e) => setMaoDeObra(e.target.value)} />
            </Campo>
            {numero("maoDeObraPercentSobreCusto", "Mão de obra sobre o custo (%)", "Soma com a de m². Deixe 0 se não usar.")}
            {numero("perdaAluminioPercent", "Perda de alumínio (%)")}
            {numero("impostoPercent", "Imposto sobre a venda (%)", "Simples Nacional, na prática. Cobrado por fora.")}
            {numero("validadeOrcamentoDias", "Validade do orçamento (dias)", undefined, "1")}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-medium text-neutral-900">Corte e produção</h2>
          <p className="mb-3 text-xs text-neutral-500">
            A espessura da serra é descontada a cada corte no plano de barras. Sem ela, o plano promete peças que não cabem na
            bancada.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {numero("espessuraSerraMm", "Espessura do disco (mm)", undefined, "1")}
            {numero("sobraMinimaAproveitavelMm", "Retalho útil a partir de (mm)", "Abaixo disso a sobra é tratada como sucata.", "10")}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-medium text-neutral-900">Condições padrão da proposta</h2>
          <Campo rotulo="Texto" ajuda="Entra automaticamente em todo orçamento novo.">
            <AreaTexto rows={6} value={form.condicoesPadrao ?? ""} onChange={(e) => alterar("condicoesPadrao", e.target.value)} />
          </Campo>
        </Card>
      </div>

      <div className="mt-4 flex justify-end">
        <Botao onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar configurações"}
        </Botao>
      </div>
    </>
  );
}
