import Link from "next/link";
import { prisma } from "@dilon-zap/erp-db";
import { BotaoLink, Card, Etiqueta, TituloPagina, Vazio } from "@/components/ui";
import { requireUsuario } from "@/lib/session";
import { podeEditarCatalogo } from "@/lib/papeis";
import { BotaoDuplicar } from "./botao-duplicar";

export const dynamic = "force-dynamic";

export default async function TipologiasPage() {
  const usuario = await requireUsuario();

  const tipologias = await prisma.tipologia.findMany({
    where: { empresaId: usuario.empresaId, ativa: true },
    include: { linha: { select: { nome: true } }, _count: { select: { pecas: true, vidros: true, ferragens: true, itens: true } } },
    orderBy: [{ categoria: "asc" }, { nome: "asc" }],
  });

  const editavel = podeEditarCatalogo(usuario.papel);

  return (
    <>
      <TituloPagina
        titulo="Tipologias"
        descricao="O molde paramétrico das suas esquadrias. Dado o vão, a tipologia gera os cortes, os vidros e as ferragens — com as SUAS fórmulas e a SUA linha de perfil."
        acao={editavel ? <BotaoLink href="/tipologias/nova">Nova tipologia</BotaoLink> : undefined}
      />

      {tipologias.length === 0 ? (
        <Card>
          <Vazio
            titulo="Nenhuma tipologia cadastrada"
            descricao="Sem tipologia, o orçamento vira digitação manual. Cadastre a primeira ou rode o seed para começar com seis prontas."
            acao={editavel ? <BotaoLink href="/tipologias/nova">Criar a primeira</BotaoLink> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tipologias.map((t) => (
            <Card key={t.id} className="flex flex-col p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/tipologias/${t.id}`} className="font-medium text-neutral-900 hover:text-accent">
                    {t.nome}
                  </Link>
                  <p className="text-xs text-neutral-500">{t.linha?.nome ?? "sem linha"}</p>
                </div>
                <Etiqueta tom="azul">{t.categoria.toLowerCase().replace("_", " ")}</Etiqueta>
              </div>

              {t.desenhoSvg && (
                <div className="mb-3 h-24 text-neutral-400 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: t.desenhoSvg }} />
              )}

              <p className="text-sm text-neutral-600">
                {t._count.pecas} peça(s) · {t._count.vidros} vidro(s) · {t._count.ferragens} ferragem(ns)
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Vão de {t.larguraMinMm}–{t.larguraMaxMm} × {t.alturaMinMm}–{t.alturaMaxMm} mm
                {t._count.itens > 0 ? ` · usada em ${t._count.itens} item(ns)` : ""}
              </p>

              {editavel && (
                <div className="mt-3 flex gap-3 border-t border-neutral-200 pt-3 text-sm">
                  <Link href={`/tipologias/${t.id}`} className="text-accent hover:underline">
                    editar
                  </Link>
                  <BotaoDuplicar tipologiaId={t.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
