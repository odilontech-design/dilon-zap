import { headers } from "next/headers";
import { prisma } from "@dilon-zap/ponto-db";
import { requireAdmin } from "@/lib/session";
import { formatarCpf } from "@/lib/documentos";
import { cabeMais, PLANOS } from "@/lib/planos";
import { BotaoLink, Card, Etiqueta, TituloPagina, Vazio } from "@/components/ui";
import { FormularioColaborador, AcoesColaborador } from "./formulario-colaborador";

export const dynamic = "force-dynamic";

export default async function PaginaColaboradores({ searchParams }: { searchParams: { editar?: string } }) {
  const u = await requireAdmin();
  const [colaboradores, jornadas] = await Promise.all([
    prisma.colaborador.findMany({
      where: { empresaId: u.empresaId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      include: { jornada: { select: { nome: true } }, usuario: { select: { trocarSenha: true } } },
    }),
    prisma.jornada.findMany({ where: { empresaId: u.empresaId, ativa: true }, select: { id: true, nome: true }, orderBy: { criadoEm: "asc" } }),
  ]);
  const plano = PLANOS[u.empresa.plano];
  const ativos = colaboradores.filter((c) => c.ativo).length;
  const podeCadastrar = cabeMais(plano.maxColaboradores, ativos);
  const emEdicao = colaboradores.find((c) => c.id === searchParams.editar);
  const h = headers();
  const endereco = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  if (jornadas.length === 0) {
    return (
      <>
        <TituloPagina titulo="Colaboradores" />
        <Card>
          <Vazio
            titulo="Primeiro, a jornada"
            descricao="Cada colaborador segue um horário de trabalho. Cadastre a jornada e volte aqui."
            acao={<BotaoLink href="/jornadas">Cadastrar jornada</BotaoLink>}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <TituloPagina
        titulo="Colaboradores"
        descricao={`${ativos}${plano.maxColaboradores ? ` de ${plano.maxColaboradores}` : ""} colaboradores ativos no plano ${plano.nome}. O colaborador entra com o CPF e uma senha provisória, que ele troca no primeiro acesso.`}
      />

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <Card>
          {colaboradores.length === 0 ? (
            <Vazio titulo="Nenhum colaborador ainda" descricao="Use o formulário ao lado para cadastrar o primeiro." />
          ) : (
            <ul className="divide-y divide-neutral-200">
              {colaboradores.map((c) => (
                <li key={c.id} className={`px-4 py-3 flex flex-wrap items-center gap-3 ${c.ativo ? "" : "opacity-60"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-neutral-900">{c.nome}</p>
                    <p className="text-xs text-neutral-500">
                      CPF {formatarCpf(c.cpf)} · {c.cargo || "sem cargo"} · {c.jornada.nome}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Etiqueta>{c.modoRegistro === "COM_FOTO" ? "com foto" : "simples"}</Etiqueta>
                    {!c.ativo && <Etiqueta tom="vermelho">desligado</Etiqueta>}
                    {c.ativo && c.usuario?.trocarSenha && <Etiqueta tom="amarelo">ainda não acessou</Etiqueta>}
                  </div>
                  <AcoesColaborador id={c.id} ativo={c.ativo} endereco={endereco} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          {emEdicao ? (
            <FormularioColaborador
              key={emEdicao.id}
              jornadas={jornadas}
              endereco={endereco}
              inicial={{
                id: emEdicao.id,
                nome: emEdicao.nome,
                cpf: emEdicao.cpf,
                pis: emEdicao.pis ?? "",
                matricula: emEdicao.matricula ?? "",
                cargo: emEdicao.cargo ?? "",
                admissao: emEdicao.admissao.toISOString().slice(0, 10),
                jornadaId: emEdicao.jornadaId,
                modoRegistro: emEdicao.modoRegistro,
              }}
            />
          ) : (
            // Sempre o mesmo componente, mesmo no limite: o cadastro do 10º
            // colaborador faz a página recarregar já "no limite", e trocar o
            // formulário por um aviso apagaria da tela a senha provisória que
            // acabou de ser gerada (ela só aparece uma vez).
            <FormularioColaborador
              jornadas={jornadas}
              endereco={endereco}
              limite={
                podeCadastrar
                  ? null
                  : `Você chegou ao limite de ${plano.maxColaboradores} colaboradores do plano ${plano.nome}. Para cadastrar mais, o próximo passo é o plano Ponto (${PLANOS.PONTO.precoDescricao}), que também traz reconhecimento facial, quiosque e ponto pelo WhatsApp. Fale com a gente pelo suporte.`
              }
            />
          )}
        </Card>
      </div>
    </>
  );
}
