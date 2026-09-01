import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { numeroDoComercial } from "@/lib/suporte";
import { LoginForm } from "./login-form";
import { CarrosselTelas, type Tela } from "./carrossel-telas";
import { SolicitarAcesso } from "./solicitar-acesso";
import { LogoDilon } from "./logo-dilon";

/**
 * Página de entrada e vitrine do produto.
 *
 * Duas audiências opostas dividem esta tela: a atendente abre todo dia de
 * manhã e quer digitar e sumir daqui; quem recebe o link pela primeira vez
 * quer entender o que o sistema faz. Por isso o formulário fica numa coluna
 * própria, sempre visível, e o conteúdo comercial ao lado, nunca por cima.
 *
 * No celular a ordem inverte: o formulário vem primeiro e o comercial desce
 * pra baixo, porque quem usa todo dia não pode ter que rolar a tela pra
 * trabalhar.
 */

const SITE_DILON = "https://dilontech.com.br/";
// Os planos vivem no site, com comparacao e selo de mais vendido. Repetir
// preco aqui criaria um segundo lugar pra manter, e no dia em que os dois
// divergissem quem estaria errado seria a tela que exige deploy pra mudar.
const PLANOS_DILON = "https://dilontech.com.br/zap";

const TELAS: Tela[] = [
  {
    src: "/telas/inbox.png",
    alt: "Tela de atendimento: lista de conversas à esquerda e o atendimento aberto à direita",
    legenda: "Atendimento em andamento, com etiquetas e responsável definido.",
  },
  {
    src: "/telas/funil.png",
    alt: "Funil de vendas com os clientes distribuídos por etapa",
    legenda: "Funil de vendas por etapa.",
  },
  {
    src: "/telas/pedidos.png",
    alt: "Tela de pedidos, com catálogo de produtos e valores",
    legenda: "Pedido montado dentro da conversa.",
  },
  {
    src: "/telas/produtos.png",
    alt: "Catálogo de produtos com preço e saldo de estoque",
    legenda: "Catálogo e estoque.",
  },
];

const DIFERENCIAIS = [
  {
    titulo: "Cada conversa tem dono",
    texto:
      "Vários atendentes no mesmo número, sem um pisar no outro. A conversa é atribuída, o nome de quem responde vai junto na mensagem, e o cliente sempre sabe com quem está falando.",
  },
  {
    titulo: "Do primeiro oi ao pedido fechado",
    texto:
      "Etapas de funil, catálogo de produtos, pedido montado dentro da conversa e baixa de estoque no fechamento. A venda não muda de sistema no meio do caminho.",
  },
  {
    titulo: "Nenhum cliente esquecido",
    texto:
      "Todo atendimento vira um ticket com situação e responsável. O que ficou pendente continua à vista até alguém resolver, em vez de sumir na rolagem do WhatsApp. E o histórico fica na empresa: quando alguém sai da equipe, a relação com o cliente não vai junto no celular.",
  },
];

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/painel");

  const numero = numeroDoComercial();

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row lg:items-stretch">
        {/* Formulário: primeiro no celular, à direita no desktop. */}
        {/* bg-surface só no desktop: no celular as duas seções empilham, e
            dois tons empilhados viram faixa, não divisão. */}
        <section className="order-1 flex items-center justify-center px-5 py-10 lg:order-2 lg:w-[27rem] lg:shrink-0 lg:border-l lg:border-neutral-200 lg:bg-surface lg:px-8">
          <div className="flex w-full max-w-sm flex-col gap-4">
            <div className="rounded-xl border border-neutral-200 bg-surface p-8 shadow-sm">
              <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-accent">Dilon Zap</p>
              <h1 className="mb-7 text-3xl font-semibold tracking-tight">Entrar</h1>
              <LoginForm />
            </div>

            <p className="text-center text-xs leading-relaxed text-neutral-500">
              Já é cliente e perdeu o acesso? Fale com o responsável pela sua empresa.
            </p>

            {/* Sem número configurado, a instalação não expõe contato nenhum.
                É o que uma instalação white-label deve fazer. */}
            {numero && (
              <>
                <div className="flex items-center gap-3 pt-1 text-[11px] uppercase tracking-[0.14em] text-neutral-400">
                  <span className="h-px flex-1 bg-neutral-200" />
                  ainda não é cliente?
                  <span className="h-px flex-1 bg-neutral-200" />
                </div>
                <SolicitarAcesso numero={numero} />
                <a
                  href={PLANOS_DILON}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-center text-xs text-neutral-500 underline underline-offset-4 transition hover:text-accent"
                >
                  Ver planos e preços
                </a>
              </>
            )}
          </div>
        </section>

        {/* Comercial: abaixo no celular, à esquerda no desktop. */}
        <section className="order-2 flex flex-col justify-center gap-10 border-t border-neutral-200 px-5 py-14 lg:order-1 lg:flex-1 lg:border-t-0 lg:px-12 lg:py-20">
          <div className="flex flex-col gap-6">
            <a
              href={SITE_DILON}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit rounded transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              aria-label="Ir para o site da Dilon Tech"
            >
              <LogoDilon />
            </a>

            {/* O destaque em cor cai na segunda frase, que é onde está a
                promessa: um número só já existe, a equipe inteira nele é o que
                o produto entrega. */}
            <h2 className="max-w-2xl text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-neutral-900 sm:text-5xl lg:text-6xl">
              Um número de WhatsApp.{" "}
              <span className="text-accent">A equipe inteira atendendo.</span>
            </h2>

            <p className="max-w-xl text-lg leading-relaxed text-neutral-600">
              O Dilon Zap organiza o atendimento que já acontece no WhatsApp da sua
              empresa, sem trocar de número e sem pedir para o cliente instalar nada.
            </p>
          </div>

          <CarrosselTelas telas={TELAS} />

          <dl className="flex flex-col gap-7">
            {DIFERENCIAIS.map((d) => (
              <div key={d.titulo} className="flex flex-col gap-1.5">
                <dt className="text-xl font-semibold tracking-tight text-neutral-900">{d.titulo}</dt>
                <dd className="max-w-xl leading-relaxed text-neutral-600">{d.texto}</dd>
              </div>
            ))}
          </dl>

          <p className="text-sm text-neutral-500">
            Dilon Zap é um produto da{" "}
            <a
              href={SITE_DILON}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Dilon Tech
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
