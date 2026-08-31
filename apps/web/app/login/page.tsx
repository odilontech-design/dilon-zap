import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { TelaDoSistema } from "./tela-do-sistema";

/**
 * Página de entrada — e vitrine do produto.
 *
 * Duas audiências opostas dividem esta tela: a atendente abre todo dia de
 * manhã e quer digitar e sumir daqui; quem recebe o link pela primeira vez
 * quer entender o que o sistema faz. Por isso o formulário fica numa coluna
 * própria, sempre visível, e o conteúdo comercial ao lado — nunca por cima.
 *
 * No celular a ordem inverte: o formulário vem primeiro e o comercial desce
 * pra baixo, porque quem usa todo dia não pode ter que rolar a tela pra
 * trabalhar.
 */

const DIFERENCIAIS = [
  {
    titulo: "Cada conversa tem dono",
    texto:
      "Vários atendentes no mesmo número, sem um pisar no outro. A conversa é atribuída, o nome de quem responde vai junto na mensagem e o histórico fica no cliente, não no celular de alguém.",
  },
  {
    titulo: "Do primeiro oi ao pedido fechado",
    texto:
      "Etapas de funil, catálogo de produtos, pedido montado dentro da conversa e baixa de estoque no fechamento. A venda não muda de sistema no meio do caminho.",
  },
  {
    titulo: "Você enxerga o que travou",
    texto:
      "O sistema mostra quando a mensagem não foi entregue e avisa na tela se o número sai do ar — em vez de deixar alguém atendendo no vazio sem saber.",
  },
];

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/painel");

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row lg:items-stretch">
        {/* Formulário: primeiro no celular, à direita no desktop. */}
        {/* bg-surface só no desktop: no celular as duas seções empilham, e
            dois tons empilhados viram faixa, não divisão. */}
        <section className="order-1 flex items-center justify-center px-5 py-10 lg:order-2 lg:w-[26rem] lg:shrink-0 lg:border-l lg:border-neutral-200 lg:bg-surface lg:px-8">
          <div className="w-full max-w-sm">
            <div className="rounded-lg border border-neutral-200 bg-surface p-7 shadow-sm">
              <p className="mb-1 font-mono text-xs uppercase tracking-wide text-accent">Dilon Zap</p>
              <h1 className="mb-6 text-xl font-semibold">Entrar</h1>
              <LoginForm />
            </div>
            <p className="mt-4 text-center text-xs text-neutral-500">
              Não tem acesso? Fale com o responsável pela sua empresa.
            </p>
          </div>
        </section>

        {/* Comercial: abaixo no celular, à esquerda no desktop. */}
        <section className="order-2 flex flex-col justify-center gap-8 border-t border-neutral-200 px-5 py-12 lg:order-1 lg:flex-1 lg:border-t-0 lg:px-10 lg:py-16">
          <div className="flex flex-col gap-4">
            <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-4xl">
              Um número de WhatsApp. A equipe inteira atendendo.
            </h2>
            <p className="max-w-lg text-neutral-600">
              O Dilon Zap organiza o atendimento que já acontece no WhatsApp da sua
              empresa — sem trocar de número e sem pedir para o cliente instalar nada.
            </p>
          </div>

          <TelaDoSistema
            src="/telas/inbox.png"
            alt="Tela de atendimento do Dilon Zap: lista de conversas à esquerda e o atendimento aberto à direita"
            legenda="Atendimento em andamento, com etiquetas e responsável definido."
          />

          <dl className="flex flex-col gap-5">
            {DIFERENCIAIS.map((d) => (
              <div key={d.titulo} className="flex flex-col gap-1">
                <dt className="font-semibold text-neutral-900">{d.titulo}</dt>
                <dd className="max-w-lg text-sm leading-relaxed text-neutral-600">{d.texto}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            <TelaDoSistema
              src="/telas/funil.png"
              alt="Funil de vendas do Dilon Zap, com os clientes distribuídos por etapa"
              legenda="Funil por etapa."
            />
            <TelaDoSistema
              src="/telas/pedidos.png"
              alt="Tela de pedidos do Dilon Zap, com catálogo e valores"
              legenda="Pedido e catálogo."
            />
          </div>

          <p className="text-xs text-neutral-500">
            Dilon Zap é um produto da Dilon Tech.
          </p>
        </section>
      </div>
    </div>
  );
}
